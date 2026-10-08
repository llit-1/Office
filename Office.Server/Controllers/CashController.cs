using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Office.Server.Controllers;

[ApiController]
[Route("api/Cash")]
// Сообщения на кассы - аудитору, версии и задания касс - роли «Кассы - Обновление»
[Authorize]
public sealed partial class CashController(
    IHttpClientFactory httpClientFactory,
    IConfiguration configuration,
    ILogger<CashController> logger) : ControllerBase
{
    // Дистрибутив кассового клиента — архив с зависимостями, он заметно больше обложек библиотеки знаний.
    private const int VersionUploadLimitBytes = 256 * 1024 * 1024;

    private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNameCaseInsensitive = true };

    private string CashApiUrl => (configuration["DeliveryMenuApi:CashUrl"] ?? "https://yeapi.ludilove.ru/api/cash").TrimEnd('/');

    /// <summary>Точки для сообщений на кассы — тот же список, из которого кассы выбирают точку (yeapi getlocations).</summary>
    [HttpGet("locations")]
    [Authorize(Roles = "MenuAuditor")]
    public async Task<IActionResult> GetLocations(CancellationToken cancellationToken) => await ProxyAsync(
        () => new HttpRequestMessage(HttpMethod.Get, $"{CashApiUrl}/getlocations"),
        "Не удалось получить список торговых точек.",
        cancellationToken,
        async (response, token) => Ok(ParseLocations(await response.Content.ReadAsStringAsync(token))));

    [HttpPost("messages")]
    [Authorize(Roles = "MenuAuditor")]
    public async Task<IActionResult> SendMessage([FromBody] CashMessageRequest body, CancellationToken cancellationToken)
    {
        if (body.Location == Guid.Empty || string.IsNullOrWhiteSpace(body.Message))
            return BadRequest(new { message = "Выберите торговую точку и введите сообщение." });
        var locations = await ReadLocationsAsync(cancellationToken);
        if (locations is null)
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Не удалось проверить торговую точку. Повторите попытку." });
        if (!locations.Any(x => x.Guid == body.Location))
            return BadRequest(new { message = "Торговая точка недоступна." });

        var url = configuration["DeliveryMenuApi:MessageUrl"] ?? "https://yeapi.ludilove.ru/Message/send";
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = JsonContent.Create(new { location = body.Location, message = body.Message.Trim() })
            };
            using var response = await httpClientFactory.CreateClient("DeliveryMenuApi").SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Cash message API returned HTTP {StatusCode}", (int)response.StatusCode);
                return StatusCode(StatusCodes.Status502BadGateway, new { message = "Сервис не подтвердил отправку сообщения. Проверьте результат на кассе перед повторной отправкой." });
            }
            return NoContent();
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return StatusCode(StatusCodes.Status504GatewayTimeout, new { message = "Сервис не ответил вовремя. Сообщение могло быть отправлено — проверьте кассу перед повторной отправкой." });
        }
        catch (HttpRequestException exception)
        {
            logger.LogWarning(exception, "Could not confirm cash message submission");
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Не удалось подтвердить отправку сообщения. Проверьте результат на кассе перед повторной отправкой." });
        }
    }

    [HttpGet("versions")]
    [Authorize(Roles = "CashUpdate")]
    public async Task<IActionResult> GetVersions(CancellationToken cancellationToken) => await ProxyAsync(
        () => new HttpRequestMessage(HttpMethod.Get, $"{CashApiUrl}/versions"),
        "Не удалось получить список версий кассового клиента.",
        cancellationToken,
        async (response, token) => Ok(ParseVersions(await response.Content.ReadAsStringAsync(token))));

    [HttpPost("versions")]
    [Authorize(Roles = "CashUpdate")]
    [RequestSizeLimit(VersionUploadLimitBytes)]
    public async Task<IActionResult> AddVersion([FromForm] CashVersionForm form, CancellationToken cancellationToken)
    {
        var version = form.Version?.Trim() ?? string.Empty;
        if (version.Length == 0)
            return BadRequest(new { message = "Укажите номер версии." });
        if (!VersionPattern().IsMatch(version))
            return BadRequest(new { message = "Номер версии указывается цифрами через точку, например 1.4.8.0." });
        if (form.File is null || form.File.Length == 0)
            return BadRequest(new { message = "Выберите zip-архив с дистрибутивом." });
        if (!form.File.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Дистрибутив загружается только в формате zip." });

        return await ProxyAsync(
            () =>
            {
                var content = new MultipartFormDataContent();
                var file = new StreamContent(form.File.OpenReadStream());
                file.Headers.ContentType = new System.Net.Http.Headers.MediaTypeHeaderValue("application/zip");
                content.Add(file, "file", form.File.FileName);
                content.Add(new StringContent(version), "version");
                content.Add(new StringContent(form.Actual ? "1" : "0"), "actual");
                return new HttpRequestMessage(HttpMethod.Post, $"{CashApiUrl}/versions") { Content = content };
            },
            "Не удалось загрузить версию кассового клиента.",
            cancellationToken);
    }

    [HttpDelete("versions/{id:int}")]
    [Authorize(Roles = "CashUpdate")]
    public async Task<IActionResult> DeleteVersion(int id, CancellationToken cancellationToken) => await ProxyAsync(
        () => new HttpRequestMessage(HttpMethod.Delete, $"{CashApiUrl}/versions/{id}"),
        "Не удалось удалить версию кассового клиента.",
        cancellationToken);

    [HttpGet("versions/{id:int}/download")]
    [Authorize(Roles = "CashUpdate")]
    public async Task<IActionResult> DownloadVersion(int id, CancellationToken cancellationToken) => await ProxyAsync(
        () => new HttpRequestMessage(HttpMethod.Get, $"{CashApiUrl}/versions/{id}/download"),
        "Не удалось скачать версию кассового клиента.",
        cancellationToken,
        async (response, token) =>
        {
            // Архив читается целиком: ответ yeapi освобождается сразу после выхода из ProxyAsync.
            var bytes = await response.Content.ReadAsByteArrayAsync(token);
            var name = response.Content.Headers.ContentDisposition?.FileNameStar
                ?? response.Content.Headers.ContentDisposition?.FileName?.Trim('"');
            return File(bytes, "application/zip", string.IsNullOrWhiteSpace(name) ? $"cashclient-{id}.zip" : name);
        });

    [HttpGet("clients")]
    [Authorize(Roles = "CashUpdate")]
    public async Task<IActionResult> GetClients(CancellationToken cancellationToken) => await ProxyAsync(
        () => new HttpRequestMessage(HttpMethod.Get, $"{CashApiUrl}/getcashclients"),
        "Не удалось получить список касс.",
        cancellationToken,
        async (response, token) => Ok(ParseClients(await response.Content.ReadAsStringAsync(token))));

    /// <summary>
    /// Последняя задача каждой кассы (<c>GET /api/cash/task/{cashId}</c>): по ней карточка показывает этап
    /// обновления или удаления. 404 у yeapi означает «задач нет»; сбой одной кассы не ломает остальные.
    /// </summary>
    [HttpGet("clients/tasks")]
    [Authorize(Roles = "CashUpdate")]
    public async Task<IActionResult> GetClientTasks(CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient("DeliveryMenuApi");
        var clients = await ReadClientsAsync(client, cancellationToken);
        if (clients is null)
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Не удалось получить задачи касс." });

        using var throttle = new SemaphoreSlim(6);
        var tasks = await Task.WhenAll(clients.Select(async cash =>
        {
            await throttle.WaitAsync(cancellationToken);
            try { return await ReadLatestTaskAsync(client, cash.Id, cancellationToken); }
            finally { throttle.Release(); }
        }));
        return Ok(tasks.OfType<CashTaskDto>().ToList());
    }

    /// <summary>
    /// Ставит каждой кассе задачу на обновление до выбранной версии. Загрузка версии сама по себе
    /// ничего не устанавливает — раскатка всегда отдельное осознанное действие аудитора.
    /// </summary>
    [HttpPost("versions/{id:int}/install")]
    [Authorize(Roles = "CashUpdate")]
    public async Task<IActionResult> InstallVersion(int id, CancellationToken cancellationToken)
    {
        var client = httpClientFactory.CreateClient("DeliveryMenuApi");
        var clients = await ReadClientsAsync(client, cancellationToken);
        if (clients is null)
            return StatusCode(StatusCodes.Status502BadGateway, new { message = "Не удалось получить список касс для установки." });
        if (clients.Count == 0)
            return BadRequest(new { message = "Нет ни одной кассы, которой можно поставить задачу." });

        var queued = 0;
        var failed = new List<string>();
        foreach (var cash in clients)
        {
            if (await QueueTaskAsync(client, cash.Id, UpdateTaskType, id, cancellationToken) is null) queued++;
            else failed.Add(CashTitle(cash));
        }

        // Частичный успех — не ошибка: часть касс уже получила задачу, и откатывать это нечем.
        return Ok(new { total = clients.Count, queued, failed });
    }

    /// <summary>Ставит задачу на обновление одной кассе — из карточки в списке.</summary>
    [HttpPost("clients/{cashId:int}/install")]
    [Authorize(Roles = "CashUpdate")]
    public async Task<IActionResult> InstallOnClient(int cashId, [FromQuery] int? versionId, CancellationToken cancellationToken)
    {
        var error = await QueueTaskAsync(httpClientFactory.CreateClient("DeliveryMenuApi"), cashId, UpdateTaskType, versionId, cancellationToken);
        return error is null
            ? NoContent()
            : StatusCode(StatusCodes.Status502BadGateway, new { message = $"Касса не приняла задачу на обновление. {error}".Trim() });
    }

    /// <summary>
    /// Полное удаление кассового клиента с компьютера: монитор останавливает клиент, чистит автозагрузку
    /// и файлы, затем сам сообщает сервису об удалении.
    /// </summary>
    [HttpPost("clients/{cashId:int}/delete")]
    [Authorize(Roles = "CashUpdate")]
    public async Task<IActionResult> DeleteFromClient(int cashId, CancellationToken cancellationToken)
    {
        var error = await QueueTaskAsync(httpClientFactory.CreateClient("DeliveryMenuApi"), cashId, DeleteTaskType, null, cancellationToken);
        return error is null
            ? NoContent()
            : StatusCode(StatusCodes.Status502BadGateway, new { message = $"Касса не приняла задачу на удаление. {error}".Trim() });
    }

    // Типы задач yeapi чувствительны к регистру: сервис принимает Install, Update и Delete.
    private string UpdateTaskType => configuration["DeliveryMenuApi:CashUpdateTaskType"] ?? "Update";
    private string DeleteTaskType => configuration["DeliveryMenuApi:CashDeleteTaskType"] ?? "Delete";

    /// <summary>Ставит задачу кассе. Возвращает null при успехе или текст ошибки yeapi.</summary>
    private async Task<string?> QueueTaskAsync(HttpClient client, int cashId, string type, int? versionId, CancellationToken cancellationToken)
    {
        var url = $"{CashApiUrl}/task?cashId={cashId}&type={Uri.EscapeDataString(type)}";
        if (versionId is > 0) url += $"&versionId={versionId}";
        try
        {
            // Пустое тело обязательно: IIS перед yeapi отвечает 411 на POST без Content-Length.
            using var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = new ByteArrayContent([]) };
            using var response = await client.SendAsync(request, cancellationToken);
            if (response.IsSuccessStatusCode) return null;
            var body = await response.Content.ReadAsStringAsync(cancellationToken);
            logger.LogWarning("Cash task {Type} for {CashId} returned HTTP {StatusCode}: {Body}", type, cashId, (int)response.StatusCode, body);
            return ReadableError(body);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception exception) when (exception is HttpRequestException or OperationCanceledException)
        {
            logger.LogWarning(exception, "Cash task {Type} for {CashId} failed", type, cashId);
            return "Сервис не ответил.";
        }
    }

    private async Task<List<CashLocationDto>?> ReadLocationsAsync(CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{CashApiUrl}/getlocations");
            using var response = await httpClientFactory.CreateClient("DeliveryMenuApi").SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            return ParseLocations(await response.Content.ReadAsStringAsync(cancellationToken));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or OperationCanceledException)
        {
            logger.LogWarning(exception, "Could not read cash locations");
            return null;
        }
    }

    /// <summary>yeapi отдаёт полные записи Location; берём актуальные, только guid и название.</summary>
    public static List<CashLocationDto> ParseLocations(string payload)
    {
        var result = new List<CashLocationDto>();
        if (string.IsNullOrWhiteSpace(payload)) return result;
        using var document = JsonDocument.Parse(payload);
        if (document.RootElement.ValueKind != JsonValueKind.Array) return result;

        foreach (var item in document.RootElement.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            if (!Guid.TryParse(ReadString(item, "guid"), out var guid)) continue;
            if (ReadInt(item, "actual") is { } actual && actual != 1) continue;
            var name = ReadString(item, "name")?.Trim();
            if (string.IsNullOrEmpty(name)) continue;
            result.Add(new CashLocationDto(guid, name));
        }
        return [.. result.OrderBy(x => x.Name, StringComparer.CurrentCultureIgnoreCase)];
    }

    private async Task<List<CashClientDto>?> ReadClientsAsync(HttpClient client, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{CashApiUrl}/getcashclients");
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            return ParseClients(await response.Content.ReadAsStringAsync(cancellationToken));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or OperationCanceledException)
        {
            logger.LogWarning(exception, "Could not read cash clients");
            return null;
        }
    }

    private async Task<CashTaskDto?> ReadLatestTaskAsync(HttpClient client, int cashId, CancellationToken cancellationToken)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, $"{CashApiUrl}/task/{cashId}");
            using var response = await client.SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            return ParseTasks(cashId, await response.Content.ReadAsStringAsync(cancellationToken))
                .OrderByDescending(x => x.Id)
                .FirstOrDefault();
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { throw; }
        catch (Exception exception) when (exception is HttpRequestException or JsonException or OperationCanceledException)
        {
            logger.LogWarning(exception, "Could not read tasks of cash {CashId}", cashId);
            return null;
        }
    }

    /// <summary>yeapi отвечает на ошибку задачи либо простым текстом, либо ProblemDetails.</summary>
    public static string ReadableError(string body)
    {
        body = body.Trim();
        if (body.Length == 0 || body.StartsWith('<')) return string.Empty;
        if (!body.StartsWith('{')) return body.Length > 300 ? body[..300] : body;
        try
        {
            using var document = JsonDocument.Parse(body);
            return ReadString(document.RootElement, "message", "detail", "title") ?? string.Empty;
        }
        catch (JsonException)
        {
            return string.Empty;
        }
    }

    private static string CashTitle(CashClientDto cash) =>
        string.IsNullOrWhiteSpace(cash.Name) ? $"Касса №{cash.Id}" : cash.Name.Trim();

    /// <summary>
    /// Ответ <c>getcashclients</c> в swagger не описан. <c>cashVersion</c> приходит числом — это id версии
    /// из <c>/versions</c>; строку тоже принимаем: число — как id, остальное — как номер версии.
    /// </summary>
    public static List<CashClientDto> ParseClients(string payload)
    {
        var result = new List<CashClientDto>();
        if (string.IsNullOrWhiteSpace(payload)) return result;
        using var document = JsonDocument.Parse(payload);
        if (document.RootElement.ValueKind != JsonValueKind.Array) return result;

        foreach (var item in document.RootElement.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object || ReadInt(item, "id") is not { } id) continue;

            var versionText = ReadString(item, "cashVersion")?.Trim();
            int? versionId = int.TryParse(versionText, out var parsedVersion) ? parsedVersion : null;
            var version = versionId is null && !string.IsNullOrEmpty(versionText) ? versionText : null;

            DateTime? lastConnection = TryGetProperty(item, out var seen, "lastConnection")
                && seen.ValueKind == JsonValueKind.String && seen.TryGetDateTime(out var seenValue) ? seenValue : null;

            result.Add(new CashClientDto(
                id,
                ReadString(item, "name"),
                Guid.TryParse(ReadString(item, "locationGUID"), out var location) ? location : null,
                ReadString(item, "ip"),
                ReadInt(item, "midserver"),
                versionId,
                version,
                lastConnection));
        }
        return result;
    }

    /// <summary>
    /// yeapi отдаёт только незавершённое задание кассы — объект
    /// <c>{ id, cashId, type, stage, cashVersionId, stageChanged }</c>; завершённое пропадает (404).
    /// Массив на всякий случай тоже принимаем.
    /// </summary>
    public static List<CashTaskDto> ParseTasks(int cashId, string payload)
    {
        var result = new List<CashTaskDto>();
        if (string.IsNullOrWhiteSpace(payload)) return result;
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;
        var items = root.ValueKind == JsonValueKind.Array ? root.EnumerateArray().ToList() : [root];

        foreach (var item in items)
        {
            if (item.ValueKind != JsonValueKind.Object || ReadInt(item, "id", "taskId") is not { } id) continue;
            result.Add(new CashTaskDto(
                cashId,
                id,
                ReadString(item, "type"),
                ReadString(item, "stage", "status"),
                ReadInt(item, "cashVersionId", "versionId"),
                ReadString(item, "stageChanged", "updatedAt", "createdAt")));
        }
        return result;
    }

    private static string? ReadString(JsonElement item, params string[] names) =>
        TryGetProperty(item, out var value, names) && value.ValueKind is not (JsonValueKind.Null or JsonValueKind.Undefined)
            ? value.ToString()
            : null;

    private static int? ReadInt(JsonElement item, params string[] names)
    {
        if (!TryGetProperty(item, out var value, names)) return null;
        if (value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number)) return number;
        return value.ValueKind == JsonValueKind.String && int.TryParse(value.GetString(), out var parsed) ? parsed : null;
    }

    /// <summary>Выполняет запрос к yeapi и приводит сетевые сбои к понятному пользователю ответу.</summary>
    private async Task<IActionResult> ProxyAsync(
        Func<HttpRequestMessage> createRequest,
        string failureMessage,
        CancellationToken cancellationToken,
        Func<HttpResponseMessage, CancellationToken, Task<IActionResult>>? onSuccess = null)
    {
        try
        {
            using var request = createRequest();
            using var response = await httpClientFactory.CreateClient("DeliveryMenuApi")
                .SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning("Cash versions API {Method} {Uri} returned HTTP {StatusCode}",
                    request.Method, request.RequestUri, (int)response.StatusCode);
                var status = response.StatusCode == HttpStatusCode.NotFound
                    ? StatusCodes.Status404NotFound
                    : StatusCodes.Status502BadGateway;
                return StatusCode(status, new { message = failureMessage });
            }
            return onSuccess is null ? NoContent() : await onSuccess(response, cancellationToken);
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested)
        {
            return StatusCode(StatusCodes.Status504GatewayTimeout, new { message = "Сервис версий не ответил вовремя. Повторите попытку." });
        }
        catch (Exception exception) when (exception is HttpRequestException or JsonException)
        {
            logger.LogWarning(exception, "Cash versions API call failed");
            return StatusCode(StatusCodes.Status502BadGateway, new { message = failureMessage });
        }
    }

    /// <summary>
    /// Приводит ответ yeapi к единому виду: контракт версий не описан в swagger,
    /// поэтому поля читаются без учёта регистра и по известным синонимам.
    /// </summary>
    private static List<CashVersionDto> ParseVersions(string payload)
    {
        if (string.IsNullOrWhiteSpace(payload)) return [];
        using var document = JsonDocument.Parse(payload);
        var root = document.RootElement;
        if (root.ValueKind == JsonValueKind.Object)
        {
            // Старый RKNet-формат заворачивал коллекцию в { ok, data }.
            if (TryGetProperty(root, out var data, "data", "items", "versions")) root = data;
            else return [];
        }
        if (root.ValueKind != JsonValueKind.Array) return [];

        var versions = new List<CashVersionDto>();
        foreach (var item in root.EnumerateArray())
        {
            if (item.ValueKind != JsonValueKind.Object) continue;
            var version = TryGetProperty(item, out var versionValue, "version", "name") ? versionValue.ToString() : null;
            if (string.IsNullOrWhiteSpace(version)) continue;
            versions.Add(new CashVersionDto(
                TryGetProperty(item, out var id, "id", "versionId") && id.TryGetInt32(out var idValue) ? idValue : 0,
                version.Trim(),
                IsActual(item),
                TryGetProperty(item, out var created, "createdAt", "created", "date", "addDate") ? created.ToString() : null,
                TryGetProperty(item, out var size, "size", "fileSize", "length") && size.TryGetInt64(out var sizeValue) ? sizeValue : null));
        }
        return [.. versions.OrderByDescending(x => x.Actual).ThenByDescending(x => x.Id)];
    }

    private static bool IsActual(JsonElement item)
    {
        if (!TryGetProperty(item, out var value, "actual", "isActual")) return false;
        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.Number => value.TryGetInt32(out var number) && number != 0,
            JsonValueKind.String => string.Equals(value.GetString(), "1", StringComparison.Ordinal)
                || string.Equals(value.GetString(), "true", StringComparison.OrdinalIgnoreCase),
            _ => false
        };
    }

    private static bool TryGetProperty(JsonElement element, out JsonElement value, params string[] names)
    {
        foreach (var name in names)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (!string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase)) continue;
                value = property.Value;
                return true;
            }
        }
        value = default;
        return false;
    }

    [GeneratedRegex(@"^\d+(\.\d+){1,3}$")]
    private static partial Regex VersionPattern();

    public sealed record CashMessageRequest(Guid Location, string? Message);

    public sealed record CashLocationDto(Guid Guid, string Name);

    public sealed class CashVersionForm
    {
        public string? Version { get; set; }
        // Новая версия по умолчанию актуальна: её получают новые кассы и обновления без явной версии.
        public bool Actual { get; set; } = true;
        public IFormFile? File { get; set; }
    }

    public sealed record CashVersionDto(int Id, string Version, bool Actual, string? CreatedAt, long? Size);

    /// <summary>
    /// Касса из <c>GET /api/cash/getcashclients</c>. <c>CashVersionId</c> — id установленной версии,
    /// <c>CashVersion</c> — номер, если сервис прислал его строкой. Поле <c>location</c> ответа не используется.
    /// </summary>
    public sealed record CashClientDto(
        int Id,
        string? Name,
        Guid? LocationGuid,
        string? Ip,
        int? MidServer,
        int? CashVersionId,
        string? CashVersion,
        DateTime? LastConnection);

    /// <summary>Последняя задача кассы: тип (Install/Update/Delete) и этап, который сообщил монитор.</summary>
    public sealed record CashTaskDto(int CashId, int Id, string? Type, string? Stage, int? VersionId, string? UpdatedAt);
}
