using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;

namespace Office.Server.Controllers;

[ApiController]
[Route("api/DeliveryMenu")]
[Authorize(Roles = "Menu,MenuAuditor,MenuAdmin")]
public sealed class DeliveryStopsController(
    RKNETDBContext db,
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<DeliveryStopsController> logger) : ControllerBase
{
    private static readonly HashSet<Guid> StopLocationTypeGuids =
    [
        Guid.Parse("94AD659C-AF5B-4CA0-50AD-08DBDF6ABE84"),
        Guid.Parse("B0E427F9-8996-4C03-33C1-08DBDF713401"),
        Guid.Parse("3810B715-2164-4524-F182-08DBF1A777FF"),
        Guid.Parse("3DC24D14-FAE6-4993-A403-C4142755409A")
    ];
    private static readonly SemaphoreSlim MutationLock = new(1, 1);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.Never
    };
    private static readonly TimeZoneInfo MoscowTimeZone = ResolveMoscowTimeZone();

    private string MenuApiBaseUrl => (configuration["DeliveryMenuApi:BaseUrl"]
        ?? "https://yeapi.ludilove.ru/itemmanager").TrimEnd('/');

    private string StopApiUrl => (configuration["DeliveryMenuApi:StopUrl"]
        ?? "https://yeapi.ludilove.ru/api/stop").TrimEnd('/');

    [HttpGet("stop-locations")]
    public async Task<ActionResult<IReadOnlyList<StopLocationDto>>> GetLocations(CancellationToken cancellationToken)
    {
        if (!HasStopAccess())
            return Forbid();
        var locations = await GetAllowedLocationsAsync(cancellationToken);
        if (locations is null)
            return Unauthorized();

        return Ok(locations
            .OrderBy(x => x.Name)
            .Select(x => new StopLocationDto(x.Guid, x.Name, x.Actual, x.RKCode, x.AggregatorsCode)));
    }

    [Authorize(Roles = "MenuAuditor,MenuAdmin")]
    [HttpGet("stop-items")]
    public async Task<ActionResult<IReadOnlyList<StopMenuItemDto>>> GetStopItems(CancellationToken cancellationToken)
    {
        try
        {
            var client = httpClientFactory.CreateClient("DeliveryMenuApi");
            using var response = await client.GetAsync($"{MenuApiBaseUrl}/getmenu", cancellationToken);
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
                throw new StopApiException((int)response.StatusCode, body);

            var reference = JsonSerializer.Deserialize<StopMenuReferenceDto>(body, JsonOptions);
            var items = FlattenStopMenuItems(reference?.Categories ?? [])
                .GroupBy(x => x.Rkcode)
                .Select(group => group.First())
                .OrderBy(x => x.RkName)
                .ToList();
            return Ok(items);
        }
        catch (StopApiException ex)
        {
            return StopApiFailure(ex);
        }
        catch (HttpRequestException ex)
        {
            logger.LogWarning(ex, "Could not connect directly to delivery menu API while loading stop items");
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                message = "Не удалось подключиться к сервису меню доставки."
            });
        }
    }

    private static IEnumerable<StopMenuItemDto> FlattenStopMenuItems(
        IEnumerable<StopMenuCategoryDto> categories)
    {
        foreach (var category in categories)
        {
            foreach (var item in category.Items ?? [])
            {
                if (item.Code <= 0 || string.IsNullOrWhiteSpace(item.Name))
                    continue;

                yield return new StopMenuItemDto(
                    item.Code,
                    0,
                    item.Name.Trim(),
                    item.Name.Trim(),
                    string.Empty,
                    item.Price,
                    1,
                    string.Empty,
                    string.Empty,
                    1,
                    string.Empty);
            }

            foreach (var nestedItem in FlattenStopMenuItems(category.Categories ?? []))
                yield return nestedItem;
        }
    }

    [HttpGet("stops")]
    public async Task<ActionResult<IReadOnlyList<StopPackDto>>> GetStops(CancellationToken cancellationToken)
    {
        if (!HasStopAccess())
            return Forbid();
        var locations = await GetAllowedLocationsAsync(cancellationToken);
        if (locations is null)
            return Unauthorized();

        try
        {
            var allowedIds = locations.Select(x => x.Guid).ToHashSet();
            var packs = await GetStopPacksAsync(cancellationToken);
            return Ok(FilterPacksByLocations(packs, allowedIds));
        }
        catch (StopApiException ex)
        {
            return StopApiFailure(ex);
        }
    }

    [HttpPost("stops")]
    public async Task<IActionResult> CreateStopPack([FromBody] StopPackRequest request, CancellationToken cancellationToken)
    {
        if (!HasStopAccess())
            return Forbid();
        var isAuditor = User.IsInRole("MenuAuditor") || User.IsInRole("MenuAdmin");
        var isMenuAdmin = User.IsInRole("MenuAdmin");
        var locations = await GetAllowedLocationsAsync(cancellationToken);
        if (locations is null)
            return Unauthorized();

        var displayName = await GetCurrentUserDisplayNameAsync(cancellationToken);
        if (request.PermissionLevel == 2
            && isAuditor
            && !(isMenuAdmin
                && request.ItemId.HasValue
                && !request.LocationGUID.HasValue
                && request.Stops is { Count: 1 }
                && request.Stops[0].Item == request.ItemId
                && request.Stops[0].LocationGUID.HasValue))
        {
            return BadRequest(new { message = "Аудитор и администратор создают глобальные стопы только уровня 1." });
        }
        var validation = ValidateAndNormalizePack(request, locations, isAuditor, displayName, preservePastBegin: false);
        if (validation.Error is not null)
            return BadRequest(new { message = validation.Error });

        await MutationLock.WaitAsync(cancellationToken);
        try
        {
            if (!isAuditor)
            {
                var stop = validation.Pack!.Stops.Single();
                var now = MoscowNow();
                var packs = await GetStopPacksAsync(cancellationToken);
                if (packs.SelectMany(x => x.Stops).Any(x => IsEffective(x, now)
                    && x.Item == stop.Item
                    && x.LocationGUID == stop.LocationGUID))
                {
                    return Conflict(new { message = "Позиция уже находится в стопе для выбранной точки." });
                }
            }

            await SendStopRequestAsync(HttpMethod.Post, null, validation.Pack, cancellationToken);
            return NoContent();
        }
        catch (StopApiException ex)
        {
            return StopApiFailure(ex);
        }
        finally
        {
            MutationLock.Release();
        }
    }

    [Authorize(Roles = "MenuAuditor,MenuAdmin")]
    [HttpPut("stops/{id:int}")]
    public async Task<IActionResult> UpdateStopPack(int id, [FromBody] StopPackRequest request, CancellationToken cancellationToken)
    {
        var locations = await GetAllowedLocationsAsync(cancellationToken);
        if (locations is null)
            return Unauthorized();

        var displayName = await GetCurrentUserDisplayNameAsync(cancellationToken);
        var validation = ValidateAndNormalizePack(request, locations, true, displayName, preservePastBegin: true);
        if (validation.Error is not null)
            return BadRequest(new { message = validation.Error });

        await MutationLock.WaitAsync(cancellationToken);
        try
        {
            await SendStopRequestAsync(HttpMethod.Put, id, validation.Pack, cancellationToken);
            return NoContent();
        }
        catch (StopApiException ex)
        {
            return StopApiFailure(ex);
        }
        finally
        {
            MutationLock.Release();
        }
    }

    [Authorize(Roles = "MenuAuditor,MenuAdmin")]
    [HttpDelete("stops/{id:int}")]
    public async Task<IActionResult> DeleteStopPack(int id, CancellationToken cancellationToken)
    {
        await MutationLock.WaitAsync(cancellationToken);
        try
        {
            await SendStopRequestAsync(HttpMethod.Delete, id, null, cancellationToken);
            return NoContent();
        }
        catch (StopApiException ex)
        {
            return StopApiFailure(ex);
        }
        finally
        {
            MutationLock.Release();
        }
    }

    [Authorize(Roles = "Menu,MenuAdmin")]
    [HttpDelete("stops/items/{itemId:int}/locations/{locationGuid:guid}/level-2")]
    public async Task<IActionResult> RemoveLevelTwoStops(
        int itemId,
        Guid locationGuid,
        CancellationToken cancellationToken)
    {
        if (User.IsInRole("MenuMarketing") && !User.IsInRole("MenuAdmin"))
            return Forbid();
        var locations = await GetAllowedLocationsAsync(cancellationToken);
        if (locations is null)
            return Unauthorized();
        if (locations.All(x => x.Guid != locationGuid))
            return Forbid();

        await MutationLock.WaitAsync(cancellationToken);
        try
        {
            var now = MoscowNow();
            var packs = await GetStopPacksAsync(cancellationToken);
            var hasLevelOne = packs.Any(pack => pack.PermissionLevel == 1
                && pack.Stops.Any(stop => IsEffective(stop, now)
                    && stop.Item == itemId
                    && stop.LocationGUID == locationGuid));
            if (hasLevelOne)
            {
                return Conflict(new
                {
                    message = "Стоп уровня 2 нельзя снять, пока для позиции действует блокировка аудитора."
                });
            }

            var changed = false;
            foreach (var pack in packs)
            {
                if (pack.PermissionLevel != 2)
                    continue;
                var remaining = pack.Stops
                    .Where(x => !(IsEffective(x, now)
                        && x.Item == itemId
                        && x.LocationGUID == locationGuid))
                    .ToList();
                if (remaining.Count == pack.Stops.Count)
                    continue;

                changed = true;
                if (remaining.Count == 0)
                {
                    await SendStopRequestAsync(HttpMethod.Delete, pack.Id, null, cancellationToken);
                    continue;
                }

                var replacement = new StopPackUpstreamRequest(
                    pack.ItemId,
                    pack.ItemName,
                    pack.LocationGUID,
                    pack.LocationName,
                    pack.Begin,
                    pack.End,
                    pack.User,
                    pack.PermissionLevel,
                    remaining.Select(x => new StopUpstreamRequest(
                        x.LocationGUID,
                        x.Item,
                        x.Begin,
                        x.End)).ToList());
                await SendStopRequestAsync(HttpMethod.Put, pack.Id, replacement, cancellationToken);
            }

            return changed ? NoContent() : NotFound(new { message = "Действующий стоп уровня 2 не найден." });
        }
        catch (StopApiException ex)
        {
            return StopApiFailure(ex);
        }
        finally
        {
            MutationLock.Release();
        }
    }

    private (StopPackUpstreamRequest? Pack, string? Error) ValidateAndNormalizePack(
        StopPackRequest request,
        IReadOnlyCollection<DbContexts.RKNETDB.Models.Location> allowedLocations,
        bool isAuditor,
        string userName,
        bool preservePastBegin)
    {
        if (request.Stops is null || request.Stops.Count == 0)
            return (null, "Выберите хотя бы одну позицию или торговую точку.");

        var itemBased = request.ItemId.HasValue && !request.LocationGUID.HasValue;
        var locationBased = request.LocationGUID.HasValue && !request.ItemId.HasValue;
        if (!itemBased && !locationBased)
            return (null, "Пакет должен блокировать либо одну позицию на нескольких ТТ, либо одну ТТ для нескольких позиций.");
        if (itemBased && string.IsNullOrWhiteSpace(request.ItemName))
            return (null, "Укажите название позиции.");
        if (!isAuditor && (!itemBased || request.Stops.Count != 1))
            return (null, "Работник может поставить стоп только для одной позиции на одной своей ТТ.");

        var allowedById = allowedLocations.ToDictionary(x => x.Guid);
        var permissionLevel = request.PermissionLevel;
        if (permissionLevel is not (1 or 2))
            return (null, "Пакет должен иметь уровень 1 или 2.");
        if (!isAuditor && permissionLevel != 2)
            return (null, "Работник может создавать только стопы уровня 2.");

        var now = MoscowNow();
        var begin = permissionLevel == 2 && !isAuditor ? now : AsMoscowLocal(request.Begin);
        if (begin < now && isAuditor && !preservePastBegin)
            begin = now;
        var end = permissionLevel == 2 ? begin.Date.AddDays(1) : AsMoscowLocal(request.End);
        if (end <= begin)
            return (null, "Окончание стопа должно быть позже его начала.");

        var normalizedStops = new List<StopUpstreamRequest>(request.Stops.Count);
        foreach (var stop in request.Stops)
        {
            var locationId = itemBased ? stop.LocationGUID : request.LocationGUID;
            var itemId = itemBased ? request.ItemId : stop.Item;
            if (!locationId.HasValue || !allowedById.ContainsKey(locationId.Value))
                return (null, "В пакете выбрана торговая точка, к которой у пользователя нет доступа.");
            if (!itemId.HasValue || itemId <= 0)
                return (null, "В пакете выбрана некорректная позиция.");

            normalizedStops.Add(new StopUpstreamRequest(
                locationId.Value,
                itemId.Value,
                begin,
                end));
        }

        var locationName = locationBased && request.LocationGUID.HasValue
            ? allowedById[request.LocationGUID.Value].Name
            : null;
        var pack = new StopPackUpstreamRequest(
            itemBased ? request.ItemId : null,
            itemBased ? request.ItemName?.Trim() : null,
            locationBased ? request.LocationGUID : null,
            locationName,
            begin,
            end,
            userName,
            permissionLevel,
            normalizedStops);
        return (pack, null);
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

        // Auditors see all locations of the types supported by stop lists, including inactive ones.
        if (User.IsInRole("MenuAuditor") || User.IsInRole("MenuAdmin"))
            return await db.Locations
                .AsNoTracking()
                .Where(x => x.Actual == 1
                    && x.LocationTypeGuid.HasValue
                    && StopLocationTypeGuids.Contains(x.LocationTypeGuid.Value))
                .OrderBy(x => x.Name)
                .ToListAsync(cancellationToken);

        return user.DefaultLocations == 1
            ? await db.Locations
                .AsNoTracking()
                .Where(x => x.Actual == 1
                    && x.LocationTypeGuid.HasValue
                    && StopLocationTypeGuids.Contains(x.LocationTypeGuid.Value))
                .OrderBy(x => x.Name)
                .ToListAsync(cancellationToken)
            : user.Locations
                .Where(x => x.Actual == 1
                    && x.LocationTypeGuid.HasValue
                    && StopLocationTypeGuids.Contains(x.LocationTypeGuid.Value))
                .OrderBy(x => x.Name)
                .ToList();
    }

    private async Task<string> GetCurrentUserDisplayNameAsync(CancellationToken cancellationToken)
    {
        if (int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
        {
            var user = await db.OfficeUser.AsNoTracking()
                .Where(x => x.Id == userId)
                .Select(x => new { x.Surname, x.Name, x.Patronymic, x.Login })
                .FirstOrDefaultAsync(cancellationToken);
            if (user is not null)
            {
                var fullName = string.Join(' ', new[] { user.Surname, user.Name, user.Patronymic }
                    .Where(x => !string.IsNullOrWhiteSpace(x))
                    .Select(x => x!.Trim()));
                return string.IsNullOrWhiteSpace(fullName) ? user.Login : fullName;
            }
        }

        return User.FindFirstValue(ClaimTypes.Name) ?? "Пользователь";
    }

    private async Task<List<StopPackDto>> GetStopPacksAsync(CancellationToken cancellationToken)
    {
        using var request = new HttpRequestMessage(HttpMethod.Get, StopApiUrl);
        using var response = await SendExternalRequestAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new StopApiException((int)response.StatusCode, body);
        if (string.IsNullOrWhiteSpace(body))
            return [];
        return JsonSerializer.Deserialize<List<StopPackDto>>(body, JsonOptions) ?? [];
    }

    private async Task SendStopRequestAsync(
        HttpMethod method,
        int? id,
        StopPackUpstreamRequest? body,
        CancellationToken cancellationToken)
    {
        var url = id.HasValue ? $"{StopApiUrl}/{id.Value}" : StopApiUrl;
        using var request = new HttpRequestMessage(method, url);
        string? requestBody = null;
        if (body is not null)
        {
            requestBody = JsonSerializer.Serialize(body, JsonOptions);
            request.Content = new StringContent(
                requestBody,
                Encoding.UTF8,
                "application/json");
        }

        using var response = await SendExternalRequestAsync(request, cancellationToken, requestBody);
        if (!response.IsSuccessStatusCode)
            throw new StopApiException(
                (int)response.StatusCode,
                await response.Content.ReadAsStringAsync(cancellationToken),
                requestBody);
    }

    private async Task<HttpResponseMessage> SendExternalRequestAsync(
        HttpRequestMessage request,
        CancellationToken cancellationToken,
        string? requestBody = null)
    {
        try
        {
            return await httpClientFactory
                .CreateClient("DeliveryMenuApi")
                .SendAsync(request, cancellationToken);
        }
        catch (HttpRequestException ex)
        {
            throw new StopApiException(
                StatusCodes.Status503ServiceUnavailable,
                ex.Message,
                requestBody);
        }
    }

    private ActionResult StopApiFailure(StopApiException exception)
    {
        logger.LogWarning(
            "Stop API returned {StatusCode}. Response: {Response}. Request: {Request}",
            exception.StatusCode,
            exception.ResponseBody,
            exception.RequestBody);
        if (exception.StatusCode == StatusCodes.Status404NotFound)
            return NotFound(new { message = "Стоп-пакет не найден." });
        if (exception.StatusCode is StatusCodes.Status400BadRequest
            or StatusCodes.Status409Conflict
            or StatusCodes.Status422UnprocessableEntity)
        {
            return StatusCode(exception.StatusCode, new
            {
                message = GetStopApiErrorMessage(exception)
            });
        }
        return StatusCode(StatusCodes.Status502BadGateway, new { message = "Сервис стопов временно недоступен." });
    }

    private static string GetStopApiErrorMessage(StopApiException exception)
    {
        var response = exception.ResponseBody?.Trim();
        if (string.IsNullOrWhiteSpace(response))
            return $"Stop API отклонил запрос (HTTP {exception.StatusCode}) без описания причины.";

        try
        {
            using var document = JsonDocument.Parse(response);
            var root = document.RootElement;
            foreach (var propertyName in new[] { "message", "detail", "title", "error" })
            {
                if (root.ValueKind == JsonValueKind.Object
                    && root.TryGetProperty(propertyName, out var property)
                    && property.ValueKind == JsonValueKind.String
                    && !string.IsNullOrWhiteSpace(property.GetString()))
                {
                    return property.GetString()!;
                }
            }
        }
        catch (JsonException)
        {
            // The upstream service may return plain text instead of JSON.
        }

        return response.Length <= 800 ? response : response[..800];
    }

    private static List<StopPackDto> FilterPacksByLocations(IEnumerable<StopPackDto> packs, HashSet<Guid> allowedIds)
    {
        var result = new List<StopPackDto>();
        foreach (var pack in packs)
        {
            var allowedStops = pack.Stops.Where(x => allowedIds.Contains(x.LocationGUID)).ToList();
            if (allowedStops.Count == 0)
                continue;
            result.Add(pack with { Stops = allowedStops });
        }
        return result;
    }

    private static bool IsEffective(StopDto stop, DateTime now) => stop.Begin <= now && stop.End > now;
    private bool HasStopAccess() => User.IsInRole("MenuAuditor")
        || User.IsInRole("MenuAdmin")
        || (User.IsInRole("Menu") && !User.IsInRole("MenuMarketing"));
    private static DateTime MoscowNow() => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, MoscowTimeZone);
    private static DateTime AsMoscowLocal(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => TimeZoneInfo.ConvertTimeFromUtc(value, MoscowTimeZone),
        DateTimeKind.Local => TimeZoneInfo.ConvertTime(value, MoscowTimeZone),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Unspecified)
    };

    private static TimeZoneInfo ResolveMoscowTimeZone()
    {
        foreach (var id in new[] { "Russian Standard Time", "Europe/Moscow" })
        {
            try { return TimeZoneInfo.FindSystemTimeZoneById(id); }
            catch (TimeZoneNotFoundException) { }
        }
        return TimeZoneInfo.Utc;
    }

    private sealed class StopApiException(int statusCode, string responseBody, string? requestBody = null)
        : Exception(BuildMessage(statusCode, responseBody, requestBody))
    {
        public int StatusCode { get; } = statusCode;
        public string ResponseBody { get; } = responseBody;
        public string? RequestBody { get; } = requestBody;

        private static string BuildMessage(int statusCode, string responseBody, string? requestBody)
        {
            var response = string.IsNullOrWhiteSpace(responseBody) ? "<empty>" : responseBody;
            var request = string.IsNullOrWhiteSpace(requestBody) ? "<none>" : requestBody;
            return $"Stop API returned HTTP {statusCode}. Response: {response}. Request: {request}";
        }
    }
}

public sealed record StopLocationDto(Guid Guid, string Name, int Actual, int? RkCode, int? AggregatorsCode);

public sealed record StopMenuReferenceDto(IReadOnlyList<StopMenuCategoryDto>? Categories);

public sealed record StopMenuCategoryDto(
    int Code,
    string? Name,
    IReadOnlyList<StopMenuCategoryDto>? Categories,
    IReadOnlyList<StopMenuReferenceItemDto>? Items);

public sealed record StopMenuReferenceItemDto(int Code, string? Name, int Price);

public sealed record StopMenuItemDto(
    int Rkcode,
    int YeGroup,
    string RkName,
    string YeName,
    string Description,
    int Price,
    int Measure,
    string MeasureUnit,
    string ImageHash,
    int Actual,
    string Image);

public sealed record StopPackRequest(
    int? ItemId,
    string? ItemName,
    Guid? LocationGUID,
    string? LocationName,
    DateTime Begin,
    DateTime End,
    int PermissionLevel,
    IReadOnlyList<StopRequest> Stops);

public sealed record StopRequest(Guid? LocationGUID, int? Item);

public sealed record StopPackDto(
    int Id,
    int? ItemId,
    string? ItemName,
    Guid? LocationGUID,
    string? LocationName,
    DateTime Begin,
    DateTime End,
    string User,
    int PermissionLevel,
    List<StopDto> Stops);

public sealed record StopDto(
    int Id,
    Guid LocationGUID,
    int Item,
    int PackId,
    DateTime Begin,
    DateTime End);

public sealed record StopPackUpstreamRequest(
    int? ItemId,
    string? ItemName,
    Guid? LocationGUID,
    string? LocationName,
    DateTime Begin,
    DateTime End,
    string User,
    int PermissionLevel,
    IReadOnlyList<StopUpstreamRequest> Stops);

public sealed record StopUpstreamRequest(
    Guid LocationGUID,
    int Item,
    DateTime Begin,
    DateTime End);
