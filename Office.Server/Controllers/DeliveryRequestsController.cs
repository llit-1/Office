using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;

namespace Office.Server.Controllers;

/// <summary>
/// Запросы к Яндекс.Еде через сервис yeapi: блокировка ресторана, импорт меню и заказы.
/// Портал не ходит в Яндекс напрямую — только через этот прокси, чтобы работали роли и логирование.
/// </summary>
[ApiController]
[Route("api/DeliveryRequests")]
[Authorize(Roles = "DeliveryRequests,MenuAdmin")]
public sealed class DeliveryRequestsController(
    RKNETDBContext db,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<DeliveryRequestsController> logger) : ControllerBase
{
    private static readonly HashSet<Guid> DeliveryLocationTypeGuids =
    [
        Guid.Parse("94AD659C-AF5B-4CA0-50AD-08DBDF6ABE84"),
        Guid.Parse("B0E427F9-8996-4C03-33C1-08DBDF713401"),
        Guid.Parse("3810B715-2164-4524-F182-08DBF1A777FF"),
        Guid.Parse("3DC24D14-FAE6-4993-A403-C4142755409A")
    ];

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private static readonly DateTime FirstSqlDate = new(1753, 1, 1);

    // Москва — UTC+3 круглый год (без перехода на летнее время).
    private static readonly TimeSpan MoscowUtcOffset = TimeSpan.FromHours(3);

    private static readonly HashSet<string> MenuImportOperations = ["menu", "menu_stop_list"];
    private const int MaxPageSize = 1000;
    private const int MaxTextLength = 1000;
    private const int MaxIdsPerRequest = 200;

    private string YandexApiUrl => (configuration["DeliveryMenuApi:YandexUrl"]
        ?? "https://yeapi.ludilove.ru/yandex").TrimEnd('/');

    /// <summary>Журнал запросов yeapi по заказу: что присылал Яндекс и что ему ответили.</summary>
    private string LogApiUrl => (configuration["DeliveryMenuApi:LogUrl"]
        ?? "https://yeapi.ludilove.ru/api/Log").TrimEnd('/');

    private static readonly System.Text.RegularExpressions.Regex EatsIdPattern = new(@"^[\w-]{1,64}$");

    /// <summary>Сваггер yeapi объявляет Bearer JWT; пока токен не задан, запрос уходит без заголовка.</summary>
    private string? YandexApiToken => configuration["DeliveryMenuApi:Token"];

    [HttpGet("locations")]
    public async Task<ActionResult<IReadOnlyList<DeliveryRequestLocationDto>>> GetLocations(CancellationToken cancellationToken)
    {
        var locations = await GetAllowedLocationsAsync(cancellationToken);
        if (locations is null)
            return Unauthorized();

        return Ok(locations
            .OrderBy(x => x.Name)
            .Select(x => new DeliveryRequestLocationDto(x.Guid, x.Name, x.RKCode, x.AggregatorsCode))
            .ToList());
    }

    [HttpPost("block")]
    public async Task<IActionResult> Block([FromBody] BlockRequest request, CancellationToken cancellationToken)
    {
        if (await ResolveLocationAsync(request.LocationGuid, cancellationToken) is null)
            return LocationNotAllowed();

        // Тег блокировки yeapi проставляет сам — от нас он больше не нужен.
        var message = Trim(request.Message);
        if (message is null)
            return BadRequest(new { message = "Укажите причину блокировки." });
        if (message.Length > MaxTextLength)
            return BadRequest(new { message = $"Причина не должна быть длиннее {MaxTextLength} символов." });
        if (ValidatePeriod(request.From, request.To) is string periodError)
            return BadRequest(new { message = periodError });

        logger.LogInformation(
            "Yandex block requested by {User} for location {Location} from {From} to {To}",
            User.Identity?.Name, request.LocationGuid, request.From, request.To);

        return await ForwardAsync("block", new
        {
            locationGuid = request.LocationGuid,
            // Время вводят по Москве, а Яндекс считает переданное время UTC: 16:00 превращалось в 19:00.
            from = Moment(request.From - MoscowUtcOffset),
            to = request.To is DateTime to ? Moment(to - MoscowUtcOffset) : null,
            message,
        }, cancellationToken);
    }

    [HttpPost("block/status")]
    public async Task<IActionResult> BlockStatus([FromBody] BlockStatusRequest request, CancellationToken cancellationToken)
    {
        if (await ResolveLocationAsync(request.LocationGuid, cancellationToken) is null)
            return LocationNotAllowed();
        if (ValidatePaging(request.Limit, request.Offset) is string pagingError)
            return BadRequest(new { message = pagingError });

        return await ForwardAsync("block/status", new
        {
            locationGuid = request.LocationGuid,
            statuses = CleanList(request.Statuses),
            limit = request.Limit,
            offset = request.Offset,
        }, cancellationToken);
    }

    [HttpPost("unblock")]
    public async Task<IActionResult> Unblock([FromBody] UnblockRequest request, CancellationToken cancellationToken)
    {
        if (await ResolveLocationAsync(request.LocationGuid, cancellationToken) is null)
            return LocationNotAllowed();

        var blockIds = CleanList(request.BlockIds);
        if (blockIds.Count == 0)
            return BadRequest(new { message = "Выберите блокировки, которые нужно снять." });
        if (blockIds.Count > MaxIdsPerRequest)
            return BadRequest(new { message = $"За один раз можно снять не больше {MaxIdsPerRequest} блокировок." });

        logger.LogInformation(
            "Yandex unblock requested by {User} for location {Location}: {BlockIds}",
            User.Identity?.Name, request.LocationGuid, string.Join(", ", blockIds));

        return await ForwardAsync("unblock", new { locationGuid = request.LocationGuid, blockIds }, cancellationToken);
    }

    [HttpPost("menu/import")]
    public async Task<IActionResult> MenuImport([FromBody] MenuImportRequest request, CancellationToken cancellationToken)
    {
        if (await ResolveLocationAsync(request.LocationGuid, cancellationToken) is null)
            return LocationNotAllowed();

        // Тип операции выбирается кнопкой: импорт меню или стоп-листов.
        var operationType = Trim(request.OperationType);
        if (operationType is null || !MenuImportOperations.Contains(operationType))
            return BadRequest(new { message = "Неизвестный тип импорта." });

        logger.LogInformation(
            "Yandex menu import ({OperationType}) requested by {User} for location {Location}",
            operationType, User.Identity?.Name, request.LocationGuid);

        return await ForwardAsync("menu/import", new { locationGuid = request.LocationGuid, operationType }, cancellationToken);
    }

    /// <summary>Загрузка продаж Яндекса за день в нашу базу (по всем точкам сразу).</summary>
    [HttpPost("sales/load")]
    public async Task<IActionResult> SalesLoad([FromBody] SalesLoadRequest request, CancellationToken cancellationToken)
    {
        var date = request.Date.Date;
        if (date < FirstSqlDate)
            return BadRequest(new { message = "Укажите дату." });
        if (date > DateTime.Today)
            return BadRequest(new { message = "Нельзя подгрузить продажи за будущую дату." });

        logger.LogInformation("Yandex sales load for {Date:yyyy-MM-dd} requested by {User}", date, User.Identity?.Name);

        // Дата — календарный день, без сдвига на часовой пояс (иначе полночь ушла бы в предыдущие сутки).
        return await ForwardAsync("sales/load", new { date = Moment(date) }, cancellationToken);
    }

    [HttpPost("orders/history")]
    public async Task<IActionResult> OrdersHistory([FromBody] OrdersHistoryRequest request, CancellationToken cancellationToken)
    {
        if (await ResolveLocationAsync(request.LocationGuid, cancellationToken) is null)
            return LocationNotAllowed();
        if (ValidatePeriod(request.From, request.To) is string periodError)
            return BadRequest(new { message = periodError });
        if (ValidatePaging(request.Limit, request.Offset) is string pagingError)
            return BadRequest(new { message = pagingError });

        return await ForwardAsync("orders/history", new
        {
            locationGuid = request.LocationGuid,
            from = Moment(request.From),
            to = Moment(request.To),
            statuses = CleanList(request.Statuses),
            limit = request.Limit,
            offset = request.Offset,
        }, cancellationToken);
    }

    [HttpPost("orders/details")]
    public async Task<IActionResult> OrdersDetails([FromBody] OrdersDetailsRequest request, CancellationToken cancellationToken)
    {
        var eatsIds = CleanList(request.EatsIds);
        if (eatsIds.Count == 0)
            return BadRequest(new { message = "Укажите номера заказов." });
        if (eatsIds.Count > MaxIdsPerRequest)
            return BadRequest(new { message = $"За один раз можно запросить не больше {MaxIdsPerRequest} заказов." });

        return await ForwardAsync("orders/details", new { eatsIds }, cancellationToken);
    }

    [HttpGet("orders/{eatsId}/logs")]
    public async Task<IActionResult> OrderLogs(string eatsId, CancellationToken cancellationToken)
    {
        var id = eatsId.Trim();
        if (!EatsIdPattern.IsMatch(id))
            return BadRequest(new { message = "Некорректный номер заказа." });

        using var request = new HttpRequestMessage(HttpMethod.Get, $"{LogApiUrl}/{Uri.EscapeDataString(id)}");
        if (YandexApiToken is { Length: > 0 } token)
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        try
        {
            using var response = await httpClientFactory.CreateClient("DeliveryMenuApi").SendAsync(request, cancellationToken);
            var content = await response.Content.ReadAsStringAsync(cancellationToken);

            // Логов по заказу может не быть вовсе — это не ошибка, а пустой журнал.
            if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                return Content("[]", "application/json");

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("yeapi logs for {EatsId} returned {StatusCode}: {Response}", id, (int)response.StatusCode, content);
                return StatusCode(StatusCodes.Status502BadGateway, new { message = "Не удалось получить логи заказа." });
            }

            return Content(string.IsNullOrWhiteSpace(content) ? "[]" : AsJson(content), "application/json");
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Could not connect to yeapi logs for {EatsId}", id);
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Сервис логов недоступен. Попробуйте позже." });
        }
    }

    /// <summary>
    /// Отправляет запрос в yeapi и отдаёт ответ Яндекса как есть: его структура в портале не разбирается.
    /// </summary>
    private async Task<IActionResult> ForwardAsync(string path, object payload, CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, $"{YandexApiUrl}/{path}")
        {
            Content = new StringContent(JsonSerializer.Serialize(payload, JsonOptions), Encoding.UTF8, "application/json"),
        };
        if (YandexApiToken is { Length: > 0 } token)
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        HttpResponseMessage response;
        try
        {
            response = await httpClientFactory.CreateClient("DeliveryMenuApi").SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Could not connect to Yandex API for {Path}", path);
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                message = "Не удалось подключиться к сервису Яндекса. Попробуйте позже.",
            });
        }

        using (response)
        {
            var content = await response.Content.ReadAsStringAsync(cancellationToken);
            if (response.IsSuccessStatusCode)
                return Content(AsJson(content), "application/json");

            logger.LogWarning(
                "Yandex API {Path} returned {StatusCode}. Response: {Response}",
                path, (int)response.StatusCode, content);

            var statusCode = (int)response.StatusCode;
            if (statusCode is StatusCodes.Status400BadRequest
                or StatusCodes.Status404NotFound
                or StatusCodes.Status409Conflict
                or StatusCodes.Status422UnprocessableEntity)
            {
                return StatusCode(statusCode, new { message = DescribeFailure(content, statusCode) });
            }

            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                message = "Сервис Яндекса временно недоступен.",
            });
        }
    }

    /// <summary>Ответ сервиса может быть пустым или не-JSON — такой текст отдаём полем raw, не теряя его.</summary>
    private static string AsJson(string? content)
    {
        if (string.IsNullOrWhiteSpace(content))
            return "{}";

        try
        {
            using var parsed = JsonDocument.Parse(content);
            return content;
        }
        catch (JsonException)
        {
            return JsonSerializer.Serialize(new { raw = content }, JsonOptions);
        }
    }

    private static string DescribeFailure(string? content, int statusCode)
    {
        var body = content?.Trim();
        if (string.IsNullOrWhiteSpace(body))
            return $"Сервис Яндекса отклонил запрос (HTTP {statusCode}) без описания причины.";

        try
        {
            using var document = JsonDocument.Parse(body);
            if (document.RootElement.ValueKind == JsonValueKind.Object)
            {
                foreach (var propertyName in new[] { "message", "detail", "title", "error", "error_message" })
                {
                    if (document.RootElement.TryGetProperty(propertyName, out var property)
                        && property.ValueKind == JsonValueKind.String
                        && property.GetString() is { Length: > 0 } text)
                    {
                        return text;
                    }
                }
            }
        }
        catch (JsonException)
        {
            // Не-JSON ответ показываем как есть.
        }

        return body.Length > 300 ? $"{body[..300]}…" : body;
    }

    private static string Moment(DateTime value) =>
        DateTime.SpecifyKind(value, DateTimeKind.Unspecified).ToString("yyyy-MM-ddTHH:mm:ss");

    private static string? Trim(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static List<string> CleanList(IEnumerable<string?>? values) => values is null
        ? []
        : values.Select(Trim).OfType<string>().Distinct(StringComparer.OrdinalIgnoreCase).ToList();

    private static string? ValidatePeriod(DateTime from, DateTime? to)
    {
        if (from < FirstSqlDate || to < FirstSqlDate)
            return "Дата должна быть не раньше 01.01.1753.";
        return to < from ? "Дата окончания не может быть раньше даты начала." : null;
    }

    private static string? ValidatePaging(int limit, int offset)
    {
        if (limit is < 1 or > MaxPageSize)
            return $"Количество записей должно быть от 1 до {MaxPageSize}.";
        return offset < 0 ? "Смещение не может быть отрицательным." : null;
    }

    private ObjectResult LocationNotAllowed() =>
        StatusCode(StatusCodes.Status404NotFound, new { message = "Торговая точка не найдена или недоступна." });

    private async Task<DbContexts.RKNETDB.Models.Location?> ResolveLocationAsync(Guid guid, CancellationToken cancellationToken)
    {
        var locations = await GetAllowedLocationsAsync(cancellationToken);
        return locations?.FirstOrDefault(x => x.Guid == guid);
    }

    private async Task<List<DbContexts.RKNETDB.Models.Location>?> GetAllowedLocationsAsync(CancellationToken cancellationToken)
    {
        if (!int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
            return null;

        var user = await db.OfficeUser
            .AsNoTracking()
            .Include(x => x.Locations)
            .FirstOrDefaultAsync(x => x.Id == userId && x.Actual == 1, cancellationToken);
        if (user is null)
            return null;

        // Только точки, подключённые к доставке (Delivery = 1): список, блокировки, импорты и заказы.
        if (user.DefaultLocations == 1)
            return await db.Locations
                .AsNoTracking()
                .Where(x => x.Actual == 1
                    && x.Delivery == 1
                    && x.LocationTypeGuid.HasValue
                    && DeliveryLocationTypeGuids.Contains(x.LocationTypeGuid.Value))
                .OrderBy(x => x.Name)
                .ToListAsync(cancellationToken);

        return user.Locations
            .Where(x => x.Actual == 1
                && x.Delivery == 1
                && x.LocationTypeGuid.HasValue
                && DeliveryLocationTypeGuids.Contains(x.LocationTypeGuid.Value))
            .OrderBy(x => x.Name)
            .ToList();
    }
}

public sealed record DeliveryRequestLocationDto(Guid Guid, string Name, int? RkCode, int? AggregatorsCode);

public sealed class BlockRequest
{
    public Guid LocationGuid { get; set; }
    public DateTime From { get; set; }
    public DateTime? To { get; set; }
    public string? Message { get; set; }
}

public sealed class BlockStatusRequest
{
    public Guid LocationGuid { get; set; }
    public List<string>? Statuses { get; set; }
    public int Limit { get; set; } = 100;
    public int Offset { get; set; }
}

public sealed class UnblockRequest
{
    public Guid LocationGuid { get; set; }
    public List<string>? BlockIds { get; set; }
}

public sealed class SalesLoadRequest
{
    public DateTime Date { get; set; }
}

public sealed class MenuImportRequest
{
    public Guid LocationGuid { get; set; }
    public string? OperationType { get; set; } = "menu";
}

public sealed class OrdersHistoryRequest
{
    public Guid LocationGuid { get; set; }
    public DateTime From { get; set; }
    public DateTime To { get; set; }
    public List<string>? Statuses { get; set; }
    public int Limit { get; set; } = 100;
    public int Offset { get; set; }
}

public sealed class OrdersDetailsRequest
{
    public List<string>? EatsIds { get; set; }
}
