using System.Globalization;
using System.Security.Claims;
using Cronos;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Services;

namespace Office.Server.Controllers;

/// <summary>Раздел «Заказы»: номенклатура, доступная торговым точкам для заказа.</summary>
[Route("api/[controller]")]
[ApiController]
[Authorize(Roles = SectionRoles)]
public class OrderController : ControllerBase
{
    // Роли раздела. Администратор может всё, включая правку заказа после закрытия приёма.
    // AllItemsRole заказывает любые позиции, NativeItemsRole — только с AvaliableForNative = 1.
    private const string AdminRole = "OrdersTTAdmin";
    private const string AllItemsRole = "Order_man";
    private const string NativeItemsRole = "Order_women";
    private const string SectionRoles = AdminRole + "," + AllItemsRole + "," + NativeItemsRole;

    private const int PreviousOrdersPerLocation = 10;
    private const int UpcomingCreationDateTimes = 7;
    private const double QuantityTolerance = 1e-6;

    private readonly RKNETDBContext _context;
    private readonly GlobalService _globalService;

    public OrderController(RKNETDBContext context, GlobalService globalService)
    {
        _context = context;
        _globalService = globalService;
    }

    public class OrderItemGroupDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public List<OfficeOrderItem> Items { get; set; } = [];
    }

    public class LocationRulesDto
    {
        public List<Location> Locations { get; set; } = [];
        public List<OfficeOrderRule> Rules { get; set; } = [];
    }

    public class OrdersDTO
    {
        public string Location { get; set; } = "";
        public Guid LocationGUID { get; set; }
        public List<OrderDto>? OfficeOrders { get; set; }
    }

    /// <summary>Заказ в списке: поля OfficeOrder плюс то, чего в таблице нет, — кто оформил и когда отгрузка.</summary>
    public class OrderDto
    {
        public int Id { get; set; }
        public DateTime CreationDateTime { get; set; }

        /// <summary>Предполагаемая отгрузка; null — расписание отгрузки правила задано с ошибкой.</summary>
        public DateTime? ShipmentDateTime { get; set; }

        public Guid LocationGuid { get; set; }
        public int RuleId { get; set; }
        public int OfficeUserId { get; set; }

        /// <summary>Кто оформил: ФИО, а если оно не заполнено — логин.</summary>
        public string UserName { get; set; } = "";

        public List<OrderLineDto> Items { get; set; } = [];
    }

    /// <summary>Позиция заказа: поля позиции каталога и сколько её заказано.</summary>
    public class OrderLineDto
    {
        /// <summary>Id позиции каталога.</summary>
        public int Id { get; set; }
        public int? Rkcode { get; set; }
        public string? Name { get; set; }
        public double Step { get; set; }
        public int GroupId { get; set; }
        public int RuleId { get; set; }
        public int AvaliableForNative { get; set; }
        public int Actual { get; set; }

        public double Quantity { get; set; }
    }

    /// <summary>Тело запроса на сохранение заказа. Пользователь берётся из токена.</summary>
    public class SaveOrderRequest
    {
        public DateTime CreationDateTime { get; set; }
        public Guid LocationGuid { get; set; }
        public int RuleId { get; set; }
        public List<SaveOrderLine> Items { get; set; } = [];
    }

    public class SaveOrderLine
    {
        /// <summary>Id позиции каталога.</summary>
        public int Id { get; set; }
        public double Quantity { get; set; }
    }

    public class OrderContentsDto
    {
        public List<DateTimeMatch> DateTimeMatches { get; set; } = new();
        public List<OrderItemGroupDto> ItemGroups { get; set; } = new();
        public DateTime OrderCreationDateTime { get; set; }
        public DateTime OrderShipmentDateTime { get; set; }
        public List<OrderLineDto> OrderItems { get; set; } = new();

    }

    public class  DateTimeMatch
    {
        public List<DateTime> OrderCreationDateTime { get; set; } = new();
        public List<DateTime> OrderShipmentDateTime { get; set; } = new();
    }

    // GET: api/Order/rules/{ruleId}/items?actual=1
    [HttpGet("rules/{ruleId:int}/items")]
    public async Task<ActionResult<List<OrderItemGroupDto>>> GetItems(int ruleId, [FromQuery] int? actual = null)
    {
        var query = UsableItems(_context.OfficeOrderItems.AsNoTracking().Where(x => x.RuleId == ruleId));
        if (actual is int actualValue)
            query = query.Where(x => x.Actual == actualValue);

        return Ok(await BuildItemGroupsAsync(query));
    }

    // POST: api/Order/items
    [Authorize(Roles = AdminRole)]
    [HttpPost("items")]
    public async Task<ActionResult<OfficeOrderItem>> CreateItem([FromBody] OfficeOrderItem item)
    {
        item.Id = 0;

        var error = await ValidateItemAsync(item);
        if (error != null)
            return error;

        _context.OfficeOrderItems.Add(item);
        await _context.SaveChangesAsync();

        return Ok(item);
    }

    // PUT: api/Order/items/{id}
    [Authorize(Roles = AdminRole)]
    [HttpPut("items/{id:int}")]
    public async Task<ActionResult<OfficeOrderItem>> UpdateItem(int id, [FromBody] OfficeOrderItem item)
    {
        var existing = await _context.OfficeOrderItems.FindAsync(id);
        if (existing == null)
            return NotFound(new { message = "Позиция не найдена." });

        item.Id = id;

        var error = await ValidateItemAsync(item);
        if (error != null)
            return error;

        _context.Entry(existing).CurrentValues.SetValues(item);
        await _context.SaveChangesAsync();

        return Ok(existing);
    }

    // DELETE: api/Order/items/{id}
    [Authorize(Roles = AdminRole)]
    [HttpDelete("items/{id:int}")]
    public async Task<ActionResult> DeleteItem(int id)
    {
        var item = await _context.OfficeOrderItems.FindAsync(id);
        if (item == null)
            return NotFound(new { message = "Позиция не найдена." });

        item.Actual = 0;
        await _context.SaveChangesAsync();

        return NoContent();
    }


    // GET: api/Order/rules
    [HttpGet("rules")]
    public async Task<ActionResult<LocationRulesDto>> GetRules()
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
        return Unauthorized();
        var locations = await _globalService.GetUserLocationsAsync(userId);
        // типы заказов — в порядке заведения (по Id): «завтра», «послезавтра», «за 3 дня», дальше остальные
        var rules = await _context.OfficeOrderRules.AsNoTracking().OrderBy(x => x.Id).ToListAsync();
        return Ok(new LocationRulesDto
        {
            Locations = locations,
            Rules = rules
        });
    }

    // GET: api/Order/rules/{ruleId}/orders?locationGuid=...
    [HttpGet("rules/{ruleId:int}/orders")]
    public async Task<ActionResult<List<OrdersDTO>>> GetOrders(int ruleId, [FromQuery] Guid? locationGuid = null)
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return Unauthorized();

        var locations = await _globalService.GetUserLocationsAsync(userId);
        if (locationGuid is Guid guid)
        {
            locations = locations.Where(x => x.Guid == guid).ToList();
            if (locations.Count == 0)
                return Forbid();
        }

        var locationGuids = locations.Select(x => x.Guid).ToList();
        var now = DateTime.Now;

        // CreationDateTime — момент, когда заказ закрывается для правок и уходит на сборку.
        // Берём все ещё открытые заказы и по PreviousOrdersPerLocation последних закрытых на каждую локацию.
        var previousIds = _context.Locations
            .Where(location => locationGuids.Contains(location.Guid))
            .SelectMany(location => _context.OfficeOrders
                .Where(x => x.LocationGuid == location.Guid && x.RuleId == ruleId && x.CreationDateTime < now)
                .OrderByDescending(x => x.CreationDateTime)
                .Take(PreviousOrdersPerLocation)
                .Select(x => x.Id));

        var orders = await _context.OfficeOrders.AsNoTracking()
            .Include(x => x.Lines).ThenInclude(x => x.Item)
            .Where(x => x.RuleId == ruleId
                && locationGuids.Contains(x.LocationGuid)
                && (x.CreationDateTime >= now || previousIds.Contains(x.Id)))
            .OrderByDescending(x => x.CreationDateTime)
            .ToListAsync();

        var rule = await _context.OfficeOrderRules.AsNoTracking().FirstOrDefaultAsync(x => x.Id == ruleId);
        var orderDtos = await ToOrderDtosAsync(rule, orders);

        // локации без заказов в ответ не попадают
        var ordersByLocation = orderDtos.ToLookup(x => x.LocationGuid);
        return Ok(locations
            .Where(location => ordersByLocation.Contains(location.Guid))
            .Select(location => new OrdersDTO
            {
                Location = location.Name,
                LocationGUID = location.Guid,
                OfficeOrders = ordersByLocation[location.Guid].ToList()
            })
            .ToList());
    }

    // GET: api/Order/orders/{id}/items
    [HttpGet("orders/{id:int}/items")]
    public async Task<ActionResult<List<OrderLineDto>>> GetOrderItems(int id)
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return Unauthorized();

        var order = await _context.OfficeOrders.AsNoTracking()
            .Include(x => x.Lines).ThenInclude(x => x.Item)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (order == null)
            return NotFound(new { message = "Заказ не найден." });

        var locations = await _globalService.GetUserLocationsAsync(userId);
        if (!locations.Any(x => x.Guid == order.LocationGuid))
            return Forbid();

        return Ok(ToLineDtos(order.Lines));
    }

    // GET: api/Order/rules/{ruleId}/locations/{locationGuid}/contents?creationDateTime=...
    [HttpGet("rules/{ruleId:int}/locations/{locationGuid:guid}/contents")]
    public async Task<ActionResult<OrderContentsDto>> GetOrderContents(
        int ruleId, Guid locationGuid, [FromQuery] DateTime? creationDateTime = null)
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return Unauthorized();

        var locations = await _globalService.GetUserLocationsAsync(userId);
        if (!locations.Any(x => x.Guid == locationGuid))
            return Forbid();

        var rule = await _context.OfficeOrderRules.AsNoTracking().FirstOrDefaultAsync(x => x.Id == ruleId);
        if (rule == null)
            return NotFound(new { message = "Правило заказа не найдено." });

        var now = DateTime.Now;
        var shipmentDayOffset = await _context.OfficeOrderLocationRules.AsNoTracking()
            .Where(x => x.LocationGuid == locationGuid && x.RuleId == ruleId)
            .Select(x => (int?)x.ShipmentDayOffset)
            .FirstOrDefaultAsync() ?? 0;

        List<DateTime> creationDateTimes;
        DateTime orderCreationDateTime;
        DateTime orderShipmentDateTime;
        try
        {
            creationDateTimes = GlobalService.GetNextCronOccurrences(rule.Interval, now, UpcomingCreationDateTimes);
            if (creationDateTimes.Count == 0)
                return Conflict(new { message = "По расписанию правила нет ни одной будущей даты." });

            orderCreationDateTime = creationDateTime is DateTime requested
                ? ToServerLocalTime(requested)
                : creationDateTimes[0];

            if (GlobalService.GetPreviousCronOccurrence(rule.Interval, now) is DateTime previous)
                creationDateTimes.Insert(0, previous);

            if (GetShipmentDateTime(rule, orderCreationDateTime) is not DateTime shipment)
                return Conflict(new { message = "По расписанию отгрузки правила нет ни одной даты." });

            orderShipmentDateTime = shipment.AddDays(shipmentDayOffset);
        }
        catch (CronFormatException)
        {
            return Conflict(new { message = "Расписание правила задано с ошибкой." });
        }

        var order = await _context.OfficeOrders.AsNoTracking()
            .Include(x => x.Lines).ThenInclude(x => x.Item)
            .FirstOrDefaultAsync(x => x.RuleId == ruleId
                && x.LocationGuid == locationGuid
                && x.CreationDateTime == orderCreationDateTime);

        // набор позиций зависит от роли пользователя, а не от точки
        var items = UsableItems(_context.OfficeOrderItems.AsNoTracking().Where(x => x.RuleId == ruleId && x.Actual == 1));

        var dateTimeMatches = new List<DateTimeMatch>
        {
            new DateTimeMatch
            {
                OrderCreationDateTime = creationDateTimes,
                OrderShipmentDateTime = creationDateTimes.Select(x => GetShipmentDateTime(rule, x)?.AddDays(shipmentDayOffset) ?? DateTime.MinValue).ToList()
            }
        };

        return Ok(new OrderContentsDto
        {
            DateTimeMatches = dateTimeMatches,
            ItemGroups = await BuildItemGroupsAsync(items),
            OrderCreationDateTime = orderCreationDateTime,
            OrderShipmentDateTime = orderShipmentDateTime,
            OrderItems = order == null ? [] : ToLineDtos(order.Lines)
        });
    }

    // POST: api/Order/orders
    // Создаёт заказ или, если заказ с теми же CreationDateTime, Location и Rule уже есть, заменяет его позиции.
    [HttpPost("orders")]
    public async Task<ActionResult<OrderDto>> SaveOrder([FromBody] SaveOrderRequest order)
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return Unauthorized();

        var locations = await _globalService.GetUserLocationsAsync(userId);
        if (!locations.Any(x => x.Guid == order.LocationGuid))
            return Forbid();

        var rule = await _context.OfficeOrderRules.AsNoTracking().FirstOrDefaultAsync(x => x.Id == order.RuleId);
        if (rule == null)
            return BadRequest(new { message = "Правило заказа не найдено." });

        var creationDateTime = ToServerLocalTime(order.CreationDateTime);
        try
        {
            if (!GlobalService.IsCronOccurrence(rule.Interval, creationDateTime))
                return BadRequest(new { message = "Дата заказа не соответствует расписанию правила." });
        }
        catch (CronFormatException)
        {
            return Conflict(new { message = "Расписание правила задано с ошибкой." });
        }

        // После CreationDateTime заказ уходит на сборку: менять его может только администратор.
        if (creationDateTime <= DateTime.Now && !User.IsInRole(AdminRole))
            return Conflict(new { message = "Приём изменений по этому заказу уже закрыт." });

        // из позиций в теле запроса берём только Id и количество: сами позиции читаем из базы
        var itemIds = order.Items.Select(x => x.Id).Distinct().ToList();
        if (itemIds.Count != order.Items.Count)
            return BadRequest(new { message = "Позиция указана в заказе больше одного раза." });

        var items = await _context.OfficeOrderItems.AsNoTracking().Where(x => itemIds.Contains(x.Id)).ToDictionaryAsync(x => x.Id);
        if (items.Count != itemIds.Count)
            return BadRequest(new { message = "В заказе есть позиции, которых нет в справочнике." });

        if (!CanUseAllItems && items.Values.FirstOrDefault(x => x.AvaliableForNative != 1) is OfficeOrderItem unavailable)
            return StatusCode(StatusCodes.Status403Forbidden, new { message = $"Позиция «{unavailable.Name}» недоступна для заказа с вашей ролью." });

        // количество кратно шагу позиции; наименьшее — сам шаг. Шаг бывает дробным (12,5),
        // поэтому кратность проверяется с допуском на погрешность чисел с плавающей точкой.
        foreach (var line in order.Items)
        {
            var item = items[line.Id];
            var step = item.Step > 0 ? item.Step : 1;
            var steps = line.Quantity / step;
            if (!double.IsFinite(line.Quantity) || steps < 1 - QuantityTolerance || Math.Abs(steps - Math.Round(steps)) > QuantityTolerance)
                return BadRequest(new
                {
                    message = $"Количество позиции «{item.Name}» должно быть кратно {step.ToString(CultureInfo.GetCultureInfo("ru-RU"))}."
                });
        }

        var existing = await _context.OfficeOrders
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.RuleId == order.RuleId
                && x.LocationGuid == order.LocationGuid
                && x.CreationDateTime == creationDateTime);
        if (existing == null)
        {
            existing = new OfficeOrder
            {
                CreationDateTime = creationDateTime,
                LocationGuid = order.LocationGuid,
                RuleId = order.RuleId
            };
            _context.OfficeOrders.Add(existing);
        }

        existing.OfficeUserId = userId;

        // строки, которых нет в запросе, удаляем; у оставшихся меняем количество; новые добавляем
        var quantities = order.Items.ToDictionary(x => x.Id, x => x.Quantity);
        foreach (var line in existing.Lines.ToList())
        {
            if (quantities.Remove(line.ItemId, out var quantity))
                line.Quantity = quantity;
            else
                _context.OfficeOrderLines.Remove(line);
        }

        foreach (var (itemId, quantity) in quantities)
            existing.Lines.Add(new OfficeOrderLine { ItemId = itemId, Quantity = quantity });

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 })
        {
            // Уникальный индекс UX_OfficeOrder_Rule_Location_CreationDateTime: такой же заказ успел создать параллельный запрос.
            return Conflict(new { message = "Этот заказ только что сохранён другим запросом. Повторите сохранение." });
        }

        var saved = await _context.OfficeOrders.AsNoTracking()
            .Include(x => x.Lines).ThenInclude(x => x.Item)
            .FirstAsync(x => x.Id == existing.Id);
        return Ok((await ToOrderDtosAsync(rule, [saved]))[0]);
    }

    /// <summary>Заказы с тем, чего нет в таблице: кто оформил и когда отгрузка. Порядок заказов сохраняется.</summary>
    private async Task<List<OrderDto>> ToOrderDtosAsync(OfficeOrderRule? rule, List<OfficeOrder> orders)
    {
        var userIds = orders.Select(x => x.OfficeUserId).Distinct().ToList();
        var userNames = (await _context.OfficeUser.AsNoTracking()
                .Where(x => userIds.Contains(x.Id))
                .Select(x => new { x.Id, x.Surname, x.Name, x.Patronymic, x.Login })
                .ToListAsync())
            .ToDictionary(x => x.Id, x => DisplayName(x.Surname, x.Name, x.Patronymic, x.Login));

        var locationGuids = orders.Select(x => x.LocationGuid).Distinct().ToList();
        var shipmentDayOffsets = rule == null
            ? []
            : await _context.OfficeOrderLocationRules.AsNoTracking()
                .Where(x => x.RuleId == rule.Id && locationGuids.Contains(x.LocationGuid))
                .ToDictionaryAsync(x => x.LocationGuid, x => x.ShipmentDayOffset);

        // у заказов разных локаций на одно закрытие отгрузка по крону общая, отличается только сдвиг
        var shipments = new Dictionary<DateTime, DateTime?>();
        DateTime? ShipmentOf(OfficeOrder order)
        {
            if (!shipments.TryGetValue(order.CreationDateTime, out var shipment))
            {
                try
                {
                    shipment = rule == null ? null : GetShipmentDateTime(rule, order.CreationDateTime);
                }
                catch (CronFormatException)
                {
                    shipment = null;
                }

                shipments[order.CreationDateTime] = shipment;
            }

            return shipment?.AddDays(shipmentDayOffsets.GetValueOrDefault(order.LocationGuid));
        }

        return orders
            .Select(order => new OrderDto
            {
                Id = order.Id,
                CreationDateTime = order.CreationDateTime,
                ShipmentDateTime = ShipmentOf(order),
                LocationGuid = order.LocationGuid,
                RuleId = order.RuleId,
                OfficeUserId = order.OfficeUserId,
                UserName = userNames.GetValueOrDefault(order.OfficeUserId, ""),
                Items = ToLineDtos(order.Lines)
            })
            .ToList();
    }

    private static List<OrderLineDto> ToLineDtos(IEnumerable<OfficeOrderLine> lines) => lines
        .Where(line => line.Item != null)
        .Select(line => new OrderLineDto
        {
            Id = line.Item!.Id,
            Rkcode = line.Item.Rkcode,
            Name = line.Item.Name,
            Step = line.Item.Step,
            GroupId = line.Item.GroupId,
            RuleId = line.Item.RuleId,
            AvaliableForNative = line.Item.AvaliableForNative,
            Actual = line.Item.Actual,
            Quantity = line.Quantity
        })
        .OrderBy(x => x.Name)
        .ToList();

    // Отгрузка в БД не хранится: это первое срабатывание крона отгрузки не раньше закрытия заказа
    // (совпадение с моментом закрытия считается) плюс сдвиг правила DefaultShipmentDayOffset.
    // Сдвиг локации, если он задан, прибавляет вызывающий код.
    private static DateTime? GetShipmentDateTime(OfficeOrderRule rule, DateTime creationDateTime) =>
        GlobalService.GetNextCronOccurrences(rule.ShipmentInterval, creationDateTime, 1) is [var shipment]
            ? shipment.AddDays(rule.DefaultShipmentDayOffset)
            : null;

    private static string DisplayName(string? surname, string? name, string? patronymic, string login)
    {
        var fullName = string.Join(' ', new[] { surname, name, patronymic }
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!.Trim()));
        return string.IsNullOrWhiteSpace(fullName) ? login : fullName;
    }

    private bool CanUseAllItems => User.IsInRole(AdminRole) || User.IsInRole(AllItemsRole);

    /// <summary>Позиции, которые пользователь может видеть и заказывать: NativeItemsRole — только с AvaliableForNative = 1.</summary>
    private IQueryable<OfficeOrderItem> UsableItems(IQueryable<OfficeOrderItem> items) =>
        CanUseAllItems ? items : items.Where(x => x.AvaliableForNative == 1);

    // Даты заказов — местное время сервера без смещения, как они лежат в БД.
    private static DateTime ToServerLocalTime(DateTime value) =>
        DateTime.SpecifyKind(value.Kind == DateTimeKind.Utc ? value.ToLocalTime() : value, DateTimeKind.Unspecified);

    private async Task<List<OrderItemGroupDto>> BuildItemGroupsAsync(IQueryable<OfficeOrderItem> query)
    {
        var items = await query.OrderBy(x => x.Name).ToListAsync();

        var groupIds = items.Select(x => x.GroupId).Distinct().ToList();
        var groups = await _context.OfficeOrderGroups.AsNoTracking()
            .Where(x => groupIds.Contains(x.Id))
            .OrderBy(x => x.Name)
            .ToListAsync();

        var itemsByGroup = items.ToLookup(x => x.GroupId);
        return groups
            .Select(group => new OrderItemGroupDto
            {
                Id = group.Id,
                Name = group.Name,
                Items = itemsByGroup[group.Id].ToList()
            })
            .ToList();
    }

    private async Task<ActionResult?> ValidateItemAsync(OfficeOrderItem item)
    {
        if (item.Rkcode is int rkcode
            && await _context.OfficeOrderItems.AnyAsync(x => x.Rkcode == rkcode && x.Id != item.Id))
            return Conflict(new { message = $"Позиция с кодом R-Keeper {rkcode} уже есть." });

        if (!await _context.OfficeOrderGroups.AnyAsync(x => x.Id == item.GroupId))
            return BadRequest(new { message = "Группа не найдена." });

        if (!await _context.OfficeOrderRules.AnyAsync(x => x.Id == item.RuleId))
            return BadRequest(new { message = "Правило заказа не найдено." });

        return null;
    }
}
public class OrdersDTO
{
    public string Location { get; set; } = "";
    public Guid LocationGUID { get; set; }
    public List<OfficeOrder>? OfficeOrders { get; set; }
}
