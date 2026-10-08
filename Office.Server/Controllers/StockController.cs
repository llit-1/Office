using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Stock;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize(Roles = StockRoles.Any)]
    [WarehouseApiExceptionFilter]
    public class StockController : ControllerBase
    {
        private const int TransferActionId = 2;
        private const int MaxTransferItems = 500;
        private const int MaxCommentLength = 1000;
        private const int MaxHolderFieldLength = 100;
        private const string DefaultStorageLocationGuid = "c6c585f2-2825-4946-88a7-92ce7c97013c";
        private static readonly TimeZoneInfo MoscowTimeZone = ResolveMoscowTimeZone();

        private readonly RKNETDBContext _context;
        private readonly WarehouseApiClient _warehouseApi;
        private readonly IConfiguration _configuration;

        public StockController(RKNETDBContext context, WarehouseApiClient warehouseApi, IConfiguration configuration)
        {
            _context = context;
            _warehouseApi = warehouseApi;
            _configuration = configuration;
        }

        // ===================== Передача, поиск, карточка =====================

        // Справочники для фильтров и формы передачи
        [HttpGet("lookups")]
        public async Task<ActionResult<StockLookupsDto>> GetLookups(CancellationToken cancellationToken)
        {
            var locations = await _context.Locations.AsNoTracking()
                .OrderBy(x => x.Name)
                .Select(x => new StockLocationOption(x.Guid, x.Name, x.Actual == 1))
                .ToListAsync(cancellationToken);

            var holders = await _context.WarehouseHolders.AsNoTracking()
                .OrderBy(x => x.Surname).ThenBy(x => x.Name).ThenBy(x => x.Patronymic)
                .ToListAsync(cancellationToken);

            var categories = await _context.WarehouseCategories.AsNoTracking()
                .Where(x => x.Id != null)
                .OrderBy(x => x.Name)
                .Select(x => new StockCategoryOption(x.Id!.Value, x.Name, x.Parent, x.Actual == 1))
                .ToListAsync(cancellationToken);

            return new StockLookupsDto(locations, holders.Select(ToHolderOption).ToList(), categories);
        }

        // Добавить держателя во внешнюю складскую систему
        [HttpPost("holders")]
        public async Task<ActionResult<StockHolderOption?>> CreateHolder(
            [FromBody] StockHolderCreateRequest request,
            CancellationToken cancellationToken)
        {
            var surname = Clean(request.Surname);
            var name = Clean(request.Name);
            var patronymic = Clean(request.Patronymic);
            var jobTitle = Clean(request.JobTitle);
            var department = Clean(request.Department);

            if (surname is null || name is null)
            {
                return BadRequest(new { message = "Укажите фамилию и имя держателя." });
            }

            if (new[] { surname, name, patronymic, jobTitle, department }.Any(x => x?.Length > MaxHolderFieldLength))
            {
                return BadRequest(new { message = $"Поля держателя не должны быть длиннее {MaxHolderFieldLength} символов." });
            }

            await _warehouseApi.SendAsync(HttpMethod.Post, "holder/PostHolder", new
            {
                Surname = surname,
                Name = name,
                Patronymic = patronymic,
                JobTitle = jobTitle,
                Department = department,
                Actual = 1,
            }, cancellationToken);

            // Складская API не возвращает созданную запись, но пишет в ту же базу.
            var created = await _context.WarehouseHolders.AsNoTracking()
                .Where(x => x.Surname == surname && x.Name == name && x.Patronymic == patronymic)
                .OrderByDescending(x => x.Id)
                .FirstOrDefaultAsync(cancellationToken);

            return Ok(created is null ? null : ToHolderOption(created));
        }

        // Поиск объектов по держателю, торговым точкам и категории
        [HttpPost("search")]
        public async Task<ActionResult<IReadOnlyList<StockSearchGroupDto>>> Search(
            [FromBody] StockSearchRequest request,
            CancellationToken cancellationToken)
        {
            var selectedLocations = (request.LocationGuids ?? [])
                .Where(x => x != Guid.Empty)
                .ToHashSet();

            var groups = await _warehouseApi.SendAsync<List<WarehouseSearchGroup>>(HttpMethod.Post, "category/gethardmodel", new
            {
                holder = request.HolderId?.ToString(CultureInfo.InvariantCulture),
                cathegory = request.CategoryId?.ToString(CultureInfo.InvariantCulture),
                locationGuids = selectedLocations.Count > 0 ? selectedLocations.ToList() : null,
                actual = request.WrittenOff ? 0 : 1,
            }, cancellationToken) ?? [];

            var storageLocation = StorageLocationGuid;
            var result = new List<StockSearchGroupDto>();

            for (var index = 0; index < groups.Count; index++)
            {
                var group = groups[index];
                var items = (group.Items ?? [])
                    .Where(item => !string.IsNullOrWhiteSpace(item.Code))
                    // Складская API не всегда учитывает фильтр по точкам, поэтому он повторяется здесь, как в старом портале.
                    .Where(item => selectedLocations.Count == 0
                        || (TryParseGuid(item.Location?.Guid) is Guid guid && selectedLocations.Contains(guid)))
                    .Select(item =>
                    {
                        var holderName = HolderName(item.WarehouseHolder);
                        return new StockSearchItemDto(
                            item.Code!.Trim(),
                            Text(item.MainCat?.Name),
                            Text(item.Cat?.Name),
                            Text(item.SecondCat?.Name),
                            holderName,
                            Text(item.Location?.Name),
                            !request.WrittenOff && holderName is null && TryParseGuid(item.Location?.Guid) == storageLocation);
                    })
                    .ToList();

                if (items.Count == 0)
                {
                    continue;
                }

                result.Add(new StockSearchGroupDto(
                    $"group-{index}",
                    Text(group.MainCat?.Name),
                    Text(group.Cat?.Name),
                    Text(group.SecondCat?.Name),
                    HolderName(group.WarehouseHolder),
                    Text(group.Location?.Name),
                    items));
            }

            return result;
        }

        // Карточка объекта: текущее состояние и история операций
        [HttpGet("objects/{code}")]
        public async Task<ActionResult<StockObjectCardDto>> GetObjectCard(string code, CancellationToken cancellationToken)
        {
            if (!StockObjectCode.TryNormalize(code, out var normalizedCode))
            {
                return BadRequest(InvalidCodeError());
            }

            var history = await TryGetAsync<List<WarehouseHistoryEntry>>(
                $"transfer/GetObjectHistory?id={Uri.EscapeDataString(normalizedCode)}", cancellationToken) ?? [];
            var categories = await LoadCategoryIndexAsync(cancellationToken);

            var current = history.Select(x => x.WarehouseObjects).FirstOrDefault(x => x is not null)
                ?? await TryGetAsync<WarehouseObject>(ObjectPath(normalizedCode), cancellationToken);
            if (current is null)
            {
                return NotFound(new { message = "Объект с таким кодом не найден." });
            }

            var stockObject = ToObjectDto(normalizedCode, current, categories);
            var entries = history
                .Select(ToHistoryEntry)
                .OrderByDescending(x => x.DateTime, StringComparer.Ordinal)
                .ToList();

            return new StockObjectCardDto(stockObject, entries, stockObject.Active && User.IsInRole(StockRoles.Admin));
        }

        // Краткие данные активного объекта для списка передачи
        [HttpGet("objects/{code}/summary")]
        public async Task<ActionResult<StockObjectDto>> GetObjectSummary(string code, CancellationToken cancellationToken)
        {
            if (!StockObjectCode.TryNormalize(code, out var normalizedCode))
            {
                return BadRequest(InvalidCodeError());
            }

            var stockObject = await TryGetAsync<WarehouseObject>(ObjectPath(normalizedCode), cancellationToken);
            if (stockObject is null || stockObject.Actual == 0)
            {
                return NotFound(new { message = "Объект не найден или уже списан." });
            }

            return ToObjectDto(normalizedCode, stockObject, await LoadCategoryIndexAsync(cancellationToken));
        }

        // Передача объектов на точку и/или новому держателю
        [HttpPost("transfers")]
        public async Task<ActionResult<StockTransferResultDto>> Transfer(
            [FromBody] StockTransferRequest request,
            CancellationToken cancellationToken)
        {
            var login = User.Identity?.Name;
            if (string.IsNullOrWhiteSpace(login))
            {
                return Unauthorized();
            }

            var items = request.Items ?? [];
            if (items.Count == 0)
            {
                return BadRequest(new { message = "Добавьте хотя бы один объект." });
            }

            if (items.Count > MaxTransferItems)
            {
                return BadRequest(new { message = $"За одну передачу можно отправить не больше {MaxTransferItems} объектов." });
            }

            var defaultLocation = NullIfEmpty(request.LocationGuid);
            var defaultComment = Clean(request.Comment);
            var codes = new HashSet<string>(StringComparer.Ordinal);
            var transfers = new List<(string Code, Guid? Location, int? Holder, string Comment)>(items.Count);

            foreach (var item in items)
            {
                if (!StockObjectCode.TryNormalize(item.Code, out var code))
                {
                    return BadRequest(InvalidCodeError());
                }

                if (!codes.Add(code))
                {
                    continue;
                }

                // Назначение хранится у каждого объекта: в одной передаче объекты могут уходить на разные точки.
                var location = NullIfEmpty(item.LocationGuid) ?? defaultLocation;
                var holder = item.HolderId ?? request.HolderId;
                if (location is null && holder is null)
                {
                    return BadRequest(new { message = $"Для объекта {code} укажите конечную точку или нового держателя." });
                }

                var comment = Clean(item.Comment) ?? defaultComment;
                if (comment is null || comment.Length < 2)
                {
                    return BadRequest(new { message = "Укажите комментарий: номер заявки или основание перемещения." });
                }

                if (comment.Length > MaxCommentLength)
                {
                    return BadRequest(new { message = $"Комментарий не должен быть длиннее {MaxCommentLength} символов." });
                }

                transfers.Add((code, location, holder, comment));
            }

            var locationGuids = transfers.Select(x => x.Location).OfType<Guid>().Distinct().ToList();
            if (await _context.Locations.CountAsync(x => locationGuids.Contains(x.Guid), cancellationToken) != locationGuids.Count)
            {
                return BadRequest(new { message = "Конечная точка не найдена. Обновите страницу и выберите её заново." });
            }

            var holderIds = transfers.Select(x => x.Holder).OfType<int>().Distinct().ToList();
            if (await _context.WarehouseHolders.CountAsync(x => holderIds.Contains(x.Id), cancellationToken) != holderIds.Count)
            {
                return BadRequest(new { message = "Держатель не найден. Обновите страницу и выберите его заново." });
            }

            var now = TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, MoscowTimeZone)
                .ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);

            // Формат записи совпадает с тем, что отправлял старый портал.
            var payload = transfers.Select(transfer => new
            {
                WarehouseObjectsId = transfer.Code,
                User = login,
                NewHolder = transfer.Holder?.ToString(CultureInfo.InvariantCulture),
                Location = transfer.Location?.ToString(),
                DateTime = now,
                Comment = transfer.Comment,
                WarehouseAction = TransferActionId,
            }).ToList();

            await _warehouseApi.SendAsync(HttpMethod.Post, "transfer/SetObjectHistory", payload, cancellationToken);
            return new StockTransferResultDto(payload.Count);
        }

        // Списание объекта
        [HttpPost("objects/{code}/write-off")]
        [Authorize(Roles = StockRoles.Admin)]
        public async Task<IActionResult> WriteOff(
            string code,
            [FromBody] StockWriteOffRequest request,
            CancellationToken cancellationToken)
        {
            var login = User.Identity?.Name;
            if (string.IsNullOrWhiteSpace(login))
            {
                return Unauthorized();
            }

            if (!StockObjectCode.TryNormalize(code, out var normalizedCode))
            {
                return BadRequest(InvalidCodeError());
            }

            var comment = Clean(request.Comment);
            if (comment is null || comment.Length < 2)
            {
                return BadRequest(new { message = "Укажите причину списания." });
            }

            if (comment.Length > MaxCommentLength)
            {
                return BadRequest(new { message = $"Причина списания не должна быть длиннее {MaxCommentLength} символов." });
            }

            await _warehouseApi.SendAsync(HttpMethod.Delete, "objects/WriteOffObject", new
            {
                id = normalizedCode,
                user = login,
                comment,
            }, cancellationToken);

            return NoContent();
        }

        private Guid StorageLocationGuid =>
            Guid.TryParse(_configuration["WarehouseApi:StorageLocationGuid"], out var configured)
                ? configured
                : Guid.Parse(DefaultStorageLocationGuid);

        private async Task<T?> TryGetAsync<T>(string path, CancellationToken cancellationToken) where T : class
        {
            try
            {
                return await _warehouseApi.GetAsync<T>(path, cancellationToken);
            }
            catch (WarehouseApiException exception) when (exception.StatusCode is StatusCodes.Status400BadRequest or StatusCodes.Status404NotFound)
            {
                // Складская API отвечает 400/404 для неизвестной или списанной метки.
                return null;
            }
        }

        private async Task<IReadOnlyDictionary<int, CategoryNode>> LoadCategoryIndexAsync(CancellationToken cancellationToken)
        {
            return await _context.WarehouseCategories.AsNoTracking()
                .Where(x => x.Id != null)
                .Select(x => new { Id = x.Id!.Value, x.Name, x.Parent })
                .ToDictionaryAsync(x => x.Id, x => new CategoryNode(x.Name, x.Parent), cancellationToken);
        }

        private static StockObjectDto ToObjectDto(string code, WarehouseObject source, IReadOnlyDictionary<int, CategoryNode> categories)
        {
            var path = BuildCategoryPath(source, categories);
            var details = string.Join(" · ", new[] { Text(source.Holder?.JobTitle), Text(source.Holder?.Department) }.OfType<string>());

            return new StockObjectDto(
                code,
                path.LastOrDefault() ?? "Без наименования",
                path,
                HolderName(source.Holder),
                details.Length > 0 ? details : null,
                Text(source.Location?.Name),
                source.Actual != 0);
        }

        private static List<string> BuildCategoryPath(WarehouseObject source, IReadOnlyDictionary<int, CategoryNode> categories)
        {
            var names = new List<string>();
            var leafId = source.WarehouseCategories?.Id ?? source.WarehouseCategoriesId;
            int? parentId;

            if (leafId is int id && categories.TryGetValue(id, out var leaf))
            {
                names.Add(Text(source.WarehouseCategories?.Name) ?? leaf.Name);
                parentId = leaf.Parent;
            }
            else
            {
                if (Text(source.WarehouseCategories?.Name) is string leafName)
                {
                    names.Add(leafName);
                }

                parentId = source.WarehouseCategories?.Parent;
            }

            var guard = 0;
            while (parentId is int currentId && guard++ < 10 && categories.TryGetValue(currentId, out var parent))
            {
                names.Add(parent.Name);
                parentId = parent.Parent;
            }

            names.Reverse();
            return names;
        }

        private static StockHistoryEntryDto ToHistoryEntry(WarehouseHistoryEntry entry)
        {
            var actionId = entry.WarehouseAction?.Id ?? 0;
            var actionName = actionId switch
            {
                1 => "Оприходование",
                2 => "Перемещение",
                3 => "Списание",
                _ => Text(entry.WarehouseAction?.Name) ?? "Операция",
            };

            return new StockHistoryEntryDto(
                actionId,
                actionName,
                Text(entry.DateTime),
                Text(entry.User),
                Text(entry.Location?.Name),
                HolderName(entry.Holder),
                Text(entry.Comment));
        }

        private static StockHolderOption ToHolderOption(WarehouseHolder holder) => new(
            holder.Id,
            JoinName(holder.Surname, holder.Name, holder.Patronymic) ?? $"Держатель №{holder.Id}",
            Text(holder.JobTitle),
            Text(holder.Department),
            holder.Actual == 1);

        private static string? HolderName(WarehouseHolderRef? holder) =>
            holder is null ? null : JoinName(holder.Surname, holder.Name, holder.Patronymic);

        private static string? JoinName(params string?[] parts)
        {
            var name = string.Join(" ", parts.Select(Text).OfType<string>());
            return name.Length > 0 ? name : null;
        }

        private static string ObjectPath(string code) => $"objects/getObject?id={Uri.EscapeDataString(code)}";

        private static object InvalidCodeError() =>
            new { message = $"Код объекта должен содержать до {StockObjectCode.Length} символов 0–9 и A–F." };

        private static Guid? TryParseGuid(string? value) => Guid.TryParse(value, out var guid) ? guid : null;

        private static Guid? NullIfEmpty(Guid? value) => value == Guid.Empty ? null : value;

        private static string? Text(string? value)
        {
            var text = value?.Trim();
            return string.IsNullOrEmpty(text) ? null : text;
        }

        private static string? Clean(string? value) => Text(value);

        private static TimeZoneInfo ResolveMoscowTimeZone()
        {
            foreach (var id in new[] { "Russian Standard Time", "Europe/Moscow" })
            {
                try
                {
                    return TimeZoneInfo.FindSystemTimeZoneById(id);
                }
                catch (Exception exception) when (exception is TimeZoneNotFoundException or InvalidTimeZoneException)
                {
                }
            }

            return TimeZoneInfo.CreateCustomTimeZone("MSK", TimeSpan.FromHours(3), "MSK", "MSK");
        }

        private sealed record CategoryNode(string Name, int? Parent);

        // ===================== Структура склада =====================

        // Получить все категории (опционально только актуальные)
        [HttpGet("categories")]
        public async Task<ActionResult<IEnumerable<WarehouseCategories>>> GetCategories([FromQuery] int actual = 0)
        {
            var query = _context.WarehouseCategories.AsNoTracking();

            if (actual == 1)
            {
                query = query.Where(x => x.Actual == 1);
            }

            return await query.ToListAsync();
        }

        // Получить категорию по ID
        [HttpGet("categories/{id:int}")]
        public async Task<IActionResult> GetCategory(int id)
        {
            var category = await _context.WarehouseCategories.AsNoTracking()
                .FirstOrDefaultAsync(x => x.Id == id);
            if (category == null)
            {
                return NotFound(new { message = "Категория не найдена" });
            }

            return Ok(category);
        }

        // Получить подкатегории
        [HttpGet("categories/{id:int}/children")]
        public async Task<ActionResult<IEnumerable<WarehouseCategories>>> GetChildCategories(int id)
        {
            var children = await _context.WarehouseCategories.AsNoTracking()
                .Where(x => x.Parent == id)
                .ToListAsync();

            return Ok(children);
        }

        // Создать категорию (JSON)
        [HttpPost("categories")]
        [Authorize(Roles = StockRoles.Admin)]
        public async Task<IActionResult> CreateCategory([FromBody] CategoryUpsertDto category)
        {
            if (string.IsNullOrWhiteSpace(category.Name))
            {
                return BadRequest(new { message = "Название категории обязательно" });
            }

            var entity = new WarehouseCategories
            {
                Name = category.Name.Trim(),
                Parent = category.Parent,
                Actual = category.Actual ?? 1,
                Img = category.Img
            };

            _context.WarehouseCategories.Add(entity);
            await _context.SaveChangesAsync();

            return Ok(new { id = entity.Id, message = "Категория создана успешно" });
        }

        // Создать категорию (multipart/form-data) — для загрузки картинки
        [HttpPost("categories/form")]
        [Authorize(Roles = StockRoles.Admin)]
        public async Task<IActionResult> CreateCategoryForm([FromForm] CategoryFormDto category)
        {
            if (string.IsNullOrWhiteSpace(category.Name) || string.IsNullOrWhiteSpace(category.Actual))
            {
                return BadRequest(new { message = "Обязательные поля не заполнены" });
            }

            if (!int.TryParse(category.Actual, out var actualValue))
            {
                return BadRequest(new { message = "Некорректное значение Actual" });
            }

            var entity = new WarehouseCategories
            {
                Name = category.Name.Trim(),
                Parent = category.Parent,
                Actual = actualValue
            };

            if (category.Img != null)
            {
                using var memoryStream = new MemoryStream();
                await category.Img.CopyToAsync(memoryStream);
                entity.Img = memoryStream.ToArray();
            }

            _context.WarehouseCategories.Add(entity);
            await _context.SaveChangesAsync();

            return Ok(new { id = entity.Id, message = "Категория создана успешно" });
        }

        // Обновить категорию (JSON)
        [HttpPut("categories/{id:int}")]
        [Authorize(Roles = StockRoles.Admin)]
        public async Task<IActionResult> UpdateCategory(int id, [FromBody] CategoryUpsertDto categoryData)
        {
            var category = await _context.WarehouseCategories.FirstOrDefaultAsync(x => x.Id == id);
            if (category == null)
            {
                return NotFound(new { message = "Категория не найдена" });
            }

            if (string.IsNullOrWhiteSpace(categoryData.Name))
            {
                return BadRequest(new { message = "Название категории обязательно" });
            }

            category.Name = categoryData.Name.Trim();
            category.Parent = categoryData.Parent;
            category.Actual = categoryData.Actual ?? category.Actual;

            if (categoryData.Img != null)
            {
                category.Img = categoryData.Img;
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "Категория обновлена успешно" });
        }

        // Обновить категорию (multipart/form-data)
        [HttpPatch("categories/{id:int}/form")]
        [Authorize(Roles = StockRoles.Admin)]
        public async Task<IActionResult> UpdateCategoryForm(int id, [FromForm] CategoryFormDto categoryData)
        {
            var category = await _context.WarehouseCategories.FirstOrDefaultAsync(x => x.Id == id);
            if (category == null)
            {
                return NotFound(new { message = "Категория не найдена" });
            }

            if (string.IsNullOrWhiteSpace(categoryData.Name) || string.IsNullOrWhiteSpace(categoryData.Actual))
            {
                return BadRequest(new { message = "Обязательные поля не заполнены" });
            }

            if (!int.TryParse(categoryData.Actual, out var actualValue))
            {
                return BadRequest(new { message = "Некорректное значение Actual" });
            }

            category.Name = categoryData.Name.Trim();
            category.Parent = categoryData.Parent;
            category.Actual = actualValue;

            if (categoryData.Img != null)
            {
                using var memoryStream = new MemoryStream();
                await categoryData.Img.CopyToAsync(memoryStream);
                category.Img = memoryStream.ToArray();
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "Категория обновлена успешно" });
        }

        // Удалить категорию
        [HttpDelete("categories/{id:int}")]
        [Authorize(Roles = StockRoles.Admin)]
        public async Task<IActionResult> DeleteCategory(int id)
        {
            var category = await _context.WarehouseCategories.FirstOrDefaultAsync(x => x.Id == id);
            if (category == null)
            {
                return NotFound(new { message = "Категория не найдена" });
            }

            _context.WarehouseCategories.Remove(category);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Категория удалена успешно" });
        }

        // Переключить статус Actual
        [HttpPatch("categories/{id:int}/toggle-actual")]
        [Authorize(Roles = StockRoles.Admin)]
        public async Task<IActionResult> ToggleActual(int id)
        {
            var category = await _context.WarehouseCategories.FirstOrDefaultAsync(x => x.Id == id);
            if (category == null)
            {
                return NotFound(new { message = "Категория не найдена" });
            }

            category.Actual = category.Actual == 1 ? 0 : 1;
            await _context.SaveChangesAsync();

            return Ok(new { actual = category.Actual, message = "Статус обновлен" });
        }

        // Поиск категорий
        [HttpGet("search")]
        public async Task<IActionResult> SearchCategories([FromQuery] string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return BadRequest(new { message = "Параметр поиска обязателен" });
            }

            var q = query.Trim();
            var results = await _context.WarehouseCategories.AsNoTracking()
                .Where(x => x.Name != null && x.Name.Contains(q))
                .ToListAsync();

            if (results.Count == 0)
            {
                return Ok(new { message = "Результаты не найдены", data = new List<WarehouseCategories>() });
            }

            return Ok(results);
        }

        // Поиск для выпадающего списка: возвращает [id, "Путь / К / Категории"]
        [HttpGet("search-items")]
        public async Task<IActionResult> SearchItems([FromQuery] string query)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return BadRequest(new { message = "Параметр поиска обязателен" });
            }

            var allCategories = await _context.WarehouseCategories.AsNoTracking().ToListAsync();
            var dict = allCategories.Where(x => x.Id.HasValue)
                .ToDictionary(x => x.Id!.Value, x => x);

            var results = allCategories
                .Where(x => !string.IsNullOrWhiteSpace(x.Name) && x.Name.Contains(query.Trim(), System.StringComparison.OrdinalIgnoreCase))
                .ToList();

            if (results.Count == 0)
            {
                return Ok(new { message = "Результаты не найдены" });
            }

            var items = new List<CategorySearchItem>();

            foreach (var category in results)
            {
                var path = BuildCategoryPath(category, dict, out var rootId);
                items.Add(new CategorySearchItem { Id = rootId, Text = path });
            }

            return Ok(items);
        }

        // Дерево категорий (как StockTable в MVC)
        [HttpGet("categories/{id:int}/tree")]
        public async Task<ActionResult<CategoriesHierarchyWithCategoryID>> GetCategoryTree(int id)
        {
            var allCategories = await _context.WarehouseCategories.AsNoTracking().ToListAsync();
            var dict = allCategories.Where(x => x.Id.HasValue)
                .ToDictionary(x => x.Id!.Value, x => x);

            var children = allCategories.Where(x => x.Parent == id).ToList();

            var tree = new List<CategoriesHierarchy>();
            foreach (var child in children)
            {
                tree.Add(BuildTree(child, dict));
            }

            return new CategoriesHierarchyWithCategoryID
            {
                CategoryID = id,
                Categories = tree
            };
        }

        private static CategoriesHierarchy BuildTree(WarehouseCategories category, Dictionary<int, WarehouseCategories> all)
        {
            var node = new CategoriesHierarchy
            {
                Id = category.Id ?? 0,
                Name = category.Name ?? string.Empty,
                Actual = category.Actual
            };

            if (category.Id.HasValue)
            {
                var children = all.Values.Where(x => x.Parent == category.Id).ToList();
                foreach (var child in children)
                {
                    node.Categories.Add(BuildTree(child, all));
                }
            }

            return node;
        }

        private static string BuildCategoryPath(WarehouseCategories category, Dictionary<int, WarehouseCategories> all, out int rootId)
        {
            var names = new List<string>();
            var current = category;
            var guard = 0;
            rootId = current.Id ?? 0;

            while (current != null && guard++ < 100)
            {
                if (!string.IsNullOrWhiteSpace(current.Name))
                {
                    names.Add(current.Name);
                }

                if (current.Parent == null || !all.TryGetValue(current.Parent.Value, out var parent))
                {
                    if (current.Id.HasValue)
                    {
                        rootId = current.Id.Value;
                    }
                    break;
                }

                current = parent;
            }

            names.Reverse();
            return string.Join(" / ", names);
        }

        public class CategoryUpsertDto
        {
            public string Name { get; set; } = string.Empty;
            public int? Parent { get; set; }
            public int? Actual { get; set; }
            public byte[]? Img { get; set; }
        }

        public class CategoryFormDto
        {
            public string Name { get; set; } = string.Empty;
            public int? Parent { get; set; }
            public string? Actual { get; set; }
            public IFormFile? Img { get; set; }
        }

        public class CategoriesHierarchyWithCategoryID
        {
            public int CategoryID { get; set; }
            public List<CategoriesHierarchy> Categories { get; set; } = new();
        }

        public class CategoriesHierarchy
        {
            public int Id { get; set; }
            public string Name { get; set; } = string.Empty;
            public List<CategoriesHierarchy> Categories { get; set; } = new();
            public int Actual { get; set; }
        }

        public class CategorySearchItem
        {
            public int Id { get; set; }
            public string Text { get; set; } = string.Empty;
        }
    }
}
