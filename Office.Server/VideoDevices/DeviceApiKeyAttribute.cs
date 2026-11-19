using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace Office.Server.VideoDevices;

/// <summary>
/// Приставки не логинятся, поэтому их эндпоинты анонимные и защищены общим ключом
/// в заголовке <see cref="HeaderName"/>. Ключ задаётся в VideoDevices:DeviceApiKey
/// (appsettings.Local.json, в репозиторий не попадает). Пока ключ не задан, API приставок
/// отвечает 503 — лучше явный отказ, чем открытый доступ.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class DeviceApiKeyAttribute : Attribute, IAsyncAuthorizationFilter
{
    public const string HeaderName = "X-Device-Key";
    public const string ConfigKey = "VideoDevices:DeviceApiKey";
    private const int MinKeyLength = 32;

    public Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var configuration = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        var expected = configuration[ConfigKey];
        if (string.IsNullOrWhiteSpace(expected) || expected.Trim().Length < MinKeyLength)
        {
            context.HttpContext.RequestServices.GetRequiredService<ILogger<DeviceApiKeyAttribute>>()
                .LogError("{ConfigKey} is not configured (or shorter than {MinLength} chars); device API is disabled.", ConfigKey, MinKeyLength);
            context.Result = new ObjectResult(new { message = "API приставок не настроено." })
            {
                StatusCode = StatusCodes.Status503ServiceUnavailable
            };
            return Task.CompletedTask;
        }

        var provided = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (!KeysMatch(expected.Trim(), provided))
        {
            context.Result = new UnauthorizedObjectResult(new { message = "Неверный ключ приставки." });
        }

        return Task.CompletedTask;
    }

    internal static bool KeysMatch(string expected, string? provided)
    {
        if (string.IsNullOrEmpty(provided))
        {
            return false;
        }

        // Сравнение за постоянное время: по времени ответа ключ не подобрать.
        var expectedHash = SHA256.HashData(Encoding.UTF8.GetBytes(expected));
        var providedHash = SHA256.HashData(Encoding.UTF8.GetBytes(provided));
        return CryptographicOperations.FixedTimeEquals(expectedHash, providedHash);
    }
}
