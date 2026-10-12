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
[Authorize(Roles = "OrdersTT,OrdersTTAdmin")]
public class OrderController : ControllerBase
{
    private const string AdminRole = "OrdersTTAdmin";
    private const int PreviousOrdersPerLocation = 10;
    private const int UpcomingCreationDateTimes = 20;

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
        public List<OfficeOrder>? OfficeOrders { get; set; }
    }

    public class OrderContentsDto
    {
        public List<DateTime> OrderCreationDateTimes { get; set; } = new();
        public List<OrderItemGroupDto> ItemGroups { get; set; } = new();
        public DateTime OrderCreationDateTime { get; set; }
        public DateTime OrderShipmentDateTime { get; set; }
        public List<OfficeOrderItem> OrderItems { get; set; } = new();

    }

    // GET: api/Order/rules/{ruleId}/items?actual=1
    [HttpGet("rules/{ruleId:int}/items")]
    public async Task<ActionResult<List<OrderItemGroupDto>>> GetItems(int ruleId, [FromQuery] int? actual = null)
    {
        var query = _context.OfficeOrderItems.AsNoTracking().Where(x => x.RuleId == ruleId);
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
        var rules = await _context.OfficeOrderRules.AsNoTracking().OrderBy(x => x.Name).ToListAsync();
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
            .Include(x => x.Items)
            .Where(x => x.RuleId == ruleId
                && locationGuids.Contains(x.LocationGuid)
                && (x.CreationDateTime >= now || previousIds.Contains(x.Id)))
            .OrderByDescending(x => x.CreationDateTime)
            .ToListAsync();

        // локации без заказов в ответ не попадают
        var ordersByLocation = orders.ToLookup(x => x.LocationGuid);
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
    public async Task<ActionResult<List<OfficeOrderItem>>> GetOrderItems(int id)
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return Unauthorized();

        var order = await _context.OfficeOrders.AsNoTracking()
            .Include(x => x.Items)
            .FirstOrDefaultAsync(x => x.Id == id);
        if (order == null)
            return NotFound(new { message = "Заказ не найден." });

        var locations = await _globalService.GetUserLocationsAsync(userId);
        if (!locations.Any(x => x.Guid == order.LocationGuid))
            return Forbid();

        return Ok(order.Items.OrderBy(x => x.Name).ToList());
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

            // Отгрузка в БД не хранится: это первое срабатывание крона отгрузки не раньше закрытия заказа
            // (совпадение с моментом закрытия считается) плюс сдвиг локации, если он задан.
            var shipments = GlobalService.GetNextCronOccurrences(rule.ShipmentInterval, orderCreationDateTime, 1);
            if (shipments.Count == 0)
                return Conflict(new { message = "По расписанию отгрузки правила нет ни одной даты." });

            orderShipmentDateTime = shipments[0].AddDays(shipmentDayOffset);
        }
        catch (CronFormatException)
        {
            return Conflict(new { message = "Расписание правила задано с ошибкой." });
        }

        var order = await _context.OfficeOrders.AsNoTracking()
            .Include(x => x.Items)
            .FirstOrDefaultAsync(x => x.RuleId == ruleId
                && x.LocationGuid == locationGuid
                && x.CreationDateTime == orderCreationDateTime);

        // Entity.Owner: 1 — своя организация, 0 — франчайзи.
        var owner = await _context.LocationVersions.AsNoTracking()
            .Where(x => x.LocationGuid == locationGuid && x.Actual == 1 && x.VersionEndDate == null && x.Entity != null)
            .Select(x => (int?)x.Entity!.Owner)
            .FirstOrDefaultAsync();

        var items = _context.OfficeOrderItems.AsNoTracking().Where(x => x.RuleId == ruleId && x.Actual == 1);
        items = owner switch
        {
            1 => items.Where(x => x.AvaliableForNative == 1),
            0 => items.Where(x => x.AvaliableForFranchise == 1),
            _ => items.Where(x => x.AvaliableForNative == 1 || x.AvaliableForFranchise == 1)
        };

        return Ok(new OrderContentsDto
        {
            OrderCreationDateTimes = creationDateTimes,
            ItemGroups = await BuildItemGroupsAsync(items),
            OrderCreationDateTime = orderCreationDateTime,
            OrderShipmentDateTime = orderShipmentDateTime,
            OrderItems = order?.Items.OrderBy(x => x.Name).ToList() ?? []
        });
    }

    // POST: api/Order/orders
    // Создаёт заказ или, если заказ с теми же CreationDateTime, Location и Rule уже есть, заменяет его позиции.
    [HttpPost("orders")]
    public async Task<ActionResult<OfficeOrder>> SaveOrder([FromBody] OfficeOrder order)
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
        if (creationDateTime < DateTime.Now && !User.IsInRole(AdminRole))
            return Conflict(new { message = "Приём изменений по этому заказу уже закрыт." });

        // из позиций в теле запроса берём только Id: сами позиции читаем из базы
        var itemIds = order.Items.Select(x => x.Id).Distinct().ToList();
        var items = await _context.OfficeOrderItems.Where(x => itemIds.Contains(x.Id)).ToListAsync();
        if (items.Count != itemIds.Count)
            return BadRequest(new { message = "В заказе есть позиции, которых нет в справочнике." });

        var existing = await _context.OfficeOrders
            .Include(x => x.Items)
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
        existing.Items.Clear();
        foreach (var item in items)
            existing.Items.Add(item);

        try
        {
            await _context.SaveChangesAsync();
        }
        catch (DbUpdateException ex) when (ex.InnerException is SqlException { Number: 2601 or 2627 })
        {
            // Уникальный индекс UX_OfficeOrder_Rule_Location_CreationDateTime: такой же заказ успел создать параллельный запрос.
            return Conflict(new { message = "Этот заказ только что сохранён другим запросом. Повторите сохранение." });
        }

        return Ok(existing);
    }

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
