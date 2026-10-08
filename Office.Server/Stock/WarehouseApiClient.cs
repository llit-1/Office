using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Caching.Memory;

namespace Office.Server.Stock;

public sealed class WarehouseApiException(int statusCode, string message) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

/// <summary>Превращает ошибку складской системы в ответ с понятным сообщением вместо HTTP 500.</summary>
public sealed class WarehouseApiExceptionFilterAttribute : ExceptionFilterAttribute
{
    public override void OnException(ExceptionContext context)
    {
        if (context.Exception is not WarehouseApiException exception)
        {
            return;
        }

        context.Result = new ObjectResult(new { message = exception.Message }) { StatusCode = exception.StatusCode };
        context.ExceptionHandled = true;
    }
}

/// <summary>
/// Серверный клиент внешней складской API. Сервисная учётная запись и её токен остаются на сервере:
/// браузер работает только с api/stock и не может подменить автора операции.
/// </summary>
public class WarehouseApiClient(
    IHttpClientFactory httpClientFactory,
    IMemoryCache memoryCache,
    IConfiguration configuration,
    ILogger<WarehouseApiClient> logger)
{
    public const string HttpClientName = "WarehouseApi";
    private const string TokenCacheKey = "warehouse_api_token";
    private static readonly TimeSpan TokenLifetime = TimeSpan.FromHours(6);
    private static readonly SemaphoreSlim TokenLock = new(1, 1);
    private static readonly JsonSerializerOptions ReadOptions = new(JsonSerializerDefaults.Web);

    private string BaseUrl => (configuration["WarehouseApi:BaseUrl"] ?? "https://warehouseapi.ludilove.ru/api").TrimEnd('/');

    public async Task<T?> GetAsync<T>(string path, CancellationToken cancellationToken)
    {
        using var response = await SendRequestAsync(HttpMethod.Get, path, null, cancellationToken);
        return await ReadAsync<T>(response, path, cancellationToken);
    }

    public async Task<T?> SendAsync<T>(HttpMethod method, string path, object? body, CancellationToken cancellationToken)
    {
        using var response = await SendRequestAsync(method, path, body, cancellationToken);
        return await ReadAsync<T>(response, path, cancellationToken);
    }

    public async Task SendAsync(HttpMethod method, string path, object? body, CancellationToken cancellationToken)
    {
        using var response = await SendRequestAsync(method, path, body, cancellationToken);
    }

    private async Task<HttpResponseMessage> SendRequestAsync(HttpMethod method, string path, object? body, CancellationToken cancellationToken)
    {
        // Складская API принимает имена полей в том виде, в котором их отправлял старый портал,
        // поэтому тело сериализуется без политики именования.
        var payload = body is null ? null : JsonSerializer.Serialize(body);

        for (var attempt = 0; ; attempt++)
        {
            var token = await GetTokenAsync(forceRefresh: attempt > 0, cancellationToken);
            using var request = new HttpRequestMessage(method, $"{BaseUrl}/{path.TrimStart('/')}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (payload is not null)
            {
                request.Content = new StringContent(payload, Encoding.UTF8, "application/json");
            }

            var response = await SendWithTransportErrorsAsync(request, path, cancellationToken);
            if (response.StatusCode == HttpStatusCode.Unauthorized && attempt == 0)
            {
                // Токен мог истечь раньше срока кэша — один раз запрашиваем новый.
                response.Dispose();
                continue;
            }

            if (response.IsSuccessStatusCode)
            {
                return response;
            }

            var statusCode = (int)response.StatusCode;
            var details = await response.Content.ReadAsStringAsync(cancellationToken);
            response.Dispose();
            logger.LogWarning("Warehouse API {Method} {Path} returned {StatusCode}: {Details}",
                method, path, statusCode, Truncate(details, 2000));
            throw new WarehouseApiException(MapStatusCode(statusCode), GetUserMessage(statusCode, details));
        }
    }

    private async Task<HttpResponseMessage> SendWithTransportErrorsAsync(HttpRequestMessage request, string path, CancellationToken cancellationToken)
    {
        try
        {
            return await httpClientFactory.CreateClient(HttpClientName).SendAsync(request, cancellationToken);
        }
        catch (Exception exception) when (exception is HttpRequestException
            || (exception is TaskCanceledException && !cancellationToken.IsCancellationRequested))
        {
            logger.LogWarning(exception, "Warehouse API {Path} is unavailable.", path);
            throw new WarehouseApiException(StatusCodes.Status503ServiceUnavailable,
                "Складская система недоступна. Попробуйте ещё раз через несколько минут.");
        }
    }

    private async Task<T?> ReadAsync<T>(HttpResponseMessage response, string path, CancellationToken cancellationToken)
    {
        var json = await response.Content.ReadAsStringAsync(cancellationToken);
        if (string.IsNullOrWhiteSpace(json))
        {
            return default;
        }

        try
        {
            return JsonSerializer.Deserialize<T>(json, ReadOptions);
        }
        catch (JsonException exception)
        {
            logger.LogError(exception, "Warehouse API {Path} returned unexpected JSON: {Json}", path, Truncate(json, 2000));
            throw new WarehouseApiException(StatusCodes.Status502BadGateway,
                "Складская система вернула данные в неожиданном формате.");
        }
    }

    private async Task<string> GetTokenAsync(bool forceRefresh, CancellationToken cancellationToken)
    {
        if (!forceRefresh && memoryCache.TryGetValue<string>(TokenCacheKey, out var cachedToken) && !string.IsNullOrEmpty(cachedToken))
        {
            return cachedToken;
        }

        await TokenLock.WaitAsync(cancellationToken);
        try
        {
            if (!forceRefresh && memoryCache.TryGetValue(TokenCacheKey, out cachedToken) && !string.IsNullOrEmpty(cachedToken))
            {
                return cachedToken;
            }

            var login = configuration["WarehouseApi:Login"];
            var password = configuration["WarehouseApi:Password"];
            if (string.IsNullOrWhiteSpace(login) || string.IsNullOrWhiteSpace(password))
            {
                logger.LogError("WarehouseApi:Login/WarehouseApi:Password are not configured.");
                throw new WarehouseApiException(StatusCodes.Status500InternalServerError,
                    "Интеграция со складской системой не настроена. Обратитесь к администратору портала.");
            }

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{BaseUrl}/Authorization/login")
            {
                Content = new StringContent(JsonSerializer.Serialize(new { login, password }), Encoding.UTF8, "application/json"),
            };
            using var response = await SendWithTransportErrorsAsync(request, "Authorization/login", cancellationToken);
            var rawToken = await response.Content.ReadAsStringAsync(cancellationToken);
            var token = rawToken.Trim().Trim('"');

            if (!response.IsSuccessStatusCode || string.IsNullOrWhiteSpace(token))
            {
                logger.LogError("Warehouse API login returned {StatusCode}: {Details}",
                    (int)response.StatusCode, Truncate(rawToken, 2000));
                throw new WarehouseApiException(StatusCodes.Status502BadGateway,
                    "Не удалось подключиться к складской системе. Обратитесь к администратору портала.");
            }

            memoryCache.Set(TokenCacheKey, token, TokenLifetime);
            return token;
        }
        finally
        {
            TokenLock.Release();
        }
    }

    private static int MapStatusCode(int statusCode) => statusCode switch
    {
        StatusCodes.Status400BadRequest or StatusCodes.Status404NotFound
            or StatusCodes.Status409Conflict or StatusCodes.Status422UnprocessableEntity => statusCode,
        _ => StatusCodes.Status502BadGateway,
    };

    private static string GetUserMessage(int statusCode, string details)
    {
        var fallback = statusCode switch
        {
            StatusCodes.Status404NotFound => "Объект не найден в складской системе.",
            StatusCodes.Status400BadRequest or StatusCodes.Status409Conflict or StatusCodes.Status422UnprocessableEntity
                => "Складская система отклонила запрос.",
            _ => "Складская система вернула ошибку. Попробуйте ещё раз позже.",
        };

        // Сообщения 5xx обычно технические, пользователю показываем только осмысленный текст 4xx.
        return statusCode is >= 400 and < 500 ? ExtractMessage(details) ?? fallback : fallback;
    }

    private static string? ExtractMessage(string details)
    {
        var text = details.Trim();
        if (text.Length == 0)
        {
            return null;
        }

        if (text[0] is '{' or '"')
        {
            try
            {
                using var document = JsonDocument.Parse(text);
                var root = document.RootElement;
                if (root.ValueKind == JsonValueKind.String)
                {
                    return ShortText(root.GetString());
                }

                if (root.ValueKind == JsonValueKind.Object)
                {
                    foreach (var property in root.EnumerateObject())
                    {
                        if (property.Value.ValueKind == JsonValueKind.String
                            && property.Name.ToLowerInvariant() is "message" or "detail" or "title")
                        {
                            return ShortText(property.Value.GetString());
                        }
                    }
                }
            }
            catch (JsonException)
            {
                return null;
            }

            return null;
        }

        return text.Contains('<') ? null : ShortText(text);
    }

    private static string? ShortText(string? value)
    {
        var text = value?.Trim();
        return string.IsNullOrEmpty(text) || text.Length > 300 ? null : text;
    }

    private static string Truncate(string value, int length) => value.Length <= length ? value : value[..length];
}
