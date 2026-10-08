using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Office.Server.Nx;

/// <summary>
/// Минимальный клиент REST API Nx Witness: группы пользователей и привязка пользователя к группам.
/// Порт реализации портала (Portal/Global/NxRestClient.cs), сервер Nx отвечает по https с самоподписанным
/// сертификатом — проверка сертификата отключена в обработчике клиента <see cref="HttpClientName"/>.
/// </summary>
public sealed class NxRestClient(IHttpClientFactory httpClientFactory, IConfiguration configuration)
{
    public const string HttpClientName = "NxRest";

    private readonly IHttpClientFactory _httpClientFactory = httpClientFactory;
    private readonly IConfiguration _configuration = configuration;
    private string? _token;

    public sealed record NxItemInfo(string? Id, string? Name);

    public sealed record NxUserInfo(string? Id, string? Name, string? Login);

    /// <summary>Проверяет, что в конфигурации заполнена секция NxRest.</summary>
    public bool TryGetConfigurationError(out string? errorMessage)
    {
        var section = _configuration.GetSection("NxRest");
        foreach (var key in new[] { "Host", "Port", "Username", "Password" })
        {
            if (string.IsNullOrWhiteSpace(section[key]))
            {
                errorMessage = $"не заполнена настройка NxRest:{key}";
                return true;
            }
        }

        errorMessage = null;
        return false;
    }

    public async Task<List<NxItemInfo>> GetUserGroupsAsync(CancellationToken cancellationToken = default)
    {
        var groups = await GetArrayAsync("/rest/v4/userGroups", cancellationToken);

        return groups
            .OfType<JsonObject>()
            .Select(group => new NxItemInfo(GetString(group, "id"), GetString(group, "name")))
            .OrderBy(group => group.Name, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public async Task<List<NxUserInfo>> GetUsersAsync(CancellationToken cancellationToken = default)
    {
        var users = await GetArrayAsync("/rest/v4/users", cancellationToken);

        return users
            .OfType<JsonObject>()
            .Select(user => new NxUserInfo(GetString(user, "id"), GetString(user, "name"), GetString(user, "login")))
            .ToList();
    }

    public static bool UserExists(string? login, IEnumerable<NxUserInfo> users)
    {
        if (string.IsNullOrWhiteSpace(login))
        {
            return false;
        }

        var normalizedLogin = login.Trim();

        return users.Any(user =>
            string.Equals(user.Id, normalizedLogin, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(user.Name, normalizedLogin, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(user.Login, normalizedLogin, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// Приводит набор групп пользователя к требуемому: группы вне <paramref name="managedGroupIds"/>
    /// (выданные в Nx вручную) остаются нетронутыми.
    /// </summary>
    public async Task SyncUserGroupsAsync(
        string login,
        IEnumerable<Guid> requiredGroupIds,
        IEnumerable<Guid> managedGroupIds,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(login))
        {
            throw new NxException("Логин пользователя пустой. Невозможно синхронизировать группы NX.");
        }

        var user = await GetUserByLoginAsync(login, cancellationToken);
        var userId = GetString(user, "id");

        if (string.IsNullOrWhiteSpace(userId))
        {
            throw new NxException($"У пользователя '{login}' на стороне NX нет id.");
        }

        var required = new HashSet<string>(requiredGroupIds.Select(id => id.ToString()), StringComparer.OrdinalIgnoreCase);
        var managed = new HashSet<string>(managedGroupIds.Select(id => id.ToString()), StringComparer.OrdinalIgnoreCase);

        var currentGroupIds = (user["groupIds"] as JsonArray ?? [])
            .Select(item => item?.ToString())
            .Where(item => !string.IsNullOrWhiteSpace(item))
            .Select(item => item!)
            .ToList();

        var newGroupIds = currentGroupIds
            .Where(groupId => !managed.Contains(groupId) || required.Contains(groupId))
            .ToList();

        foreach (var groupId in required)
        {
            if (!newGroupIds.Any(item => string.Equals(item, groupId, StringComparison.OrdinalIgnoreCase)))
            {
                newGroupIds.Add(groupId);
            }
        }

        var body = new JsonObject
        {
            ["groupIds"] = new JsonArray(newGroupIds.Select(id => (JsonNode)JsonValue.Create(id)!).ToArray()),
        };

        await SendAsync(HttpMethod.Patch, $"/rest/v4/users/{Uri.EscapeDataString(userId)}", body, cancellationToken);
    }

    private async Task<JsonObject> GetUserByLoginAsync(string login, CancellationToken cancellationToken)
    {
        try
        {
            var response = await SendAsync(HttpMethod.Get, $"/rest/v4/users/{Uri.EscapeDataString(login)}", null, cancellationToken);
            if (response is JsonObject user)
            {
                return user;
            }
        }
        catch (NxException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // Nx не всегда умеет отдавать пользователя по логину — ищем перебором.
        }

        var users = await GetArrayAsync("/rest/v4/users", cancellationToken);
        var found = users
            .OfType<JsonObject>()
            .FirstOrDefault(item =>
                string.Equals(GetString(item, "id"), login, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(GetString(item, "name"), login, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(GetString(item, "login"), login, StringComparison.OrdinalIgnoreCase));

        return found ?? throw new NxException($"Пользователь '{login}' на стороне NX не найден.");
    }

    private async Task<JsonArray> GetArrayAsync(string path, CancellationToken cancellationToken)
    {
        var response = await SendAsync(HttpMethod.Get, path, null, cancellationToken);
        return response as JsonArray ?? [];
    }

    private async Task<JsonNode?> SendAsync(HttpMethod method, string path, JsonNode? body, CancellationToken cancellationToken)
    {
        var (baseUrl, _, _) = GetSettings();
        var token = await GetTokenAsync(cancellationToken);

        using var client = _httpClientFactory.CreateClient(HttpClientName);
        using var request = new HttpRequestMessage(method, baseUrl + path);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);

        if (body is not null)
        {
            request.Content = JsonContent(body.ToJsonString());
        }

        using var response = await client.SendAsync(request, cancellationToken);
        var responseText = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new NxException(
                $"NX {method.Method} {baseUrl}{path} вернул {(int)response.StatusCode}: {responseText}",
                response.StatusCode);
        }

        return string.IsNullOrWhiteSpace(responseText) ? null : JsonNode.Parse(responseText);
    }

    private async Task<string> GetTokenAsync(CancellationToken cancellationToken)
    {
        if (!string.IsNullOrEmpty(_token))
        {
            return _token;
        }

        var (baseUrl, username, password) = GetSettings();

        using var client = _httpClientFactory.CreateClient(HttpClientName);
        using var content = JsonContent(JsonSerializer.Serialize(new { username, password, setCookie = false }));

        using var response = await client.PostAsync(baseUrl + "/rest/v1/login/sessions", content, cancellationToken);
        var responseText = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            throw new NxException($"NX не принял авторизацию ({(int)response.StatusCode}): {responseText}", response.StatusCode);
        }

        var token = JsonNode.Parse(responseText) is JsonObject json ? GetString(json, "token") : null;

        if (string.IsNullOrWhiteSpace(token))
        {
            throw new NxException("NX не вернул токен авторизации.");
        }

        _token = token;
        return token;
    }

    /// <summary>Nx отвечает 415 на "application/json; charset=utf-8", поэтому заголовок ставим без charset.</summary>
    private static StringContent JsonContent(string json)
    {
        var content = new StringContent(json, Encoding.UTF8);
        content.Headers.ContentType = new MediaTypeHeaderValue("application/json");
        return content;
    }

    private (string BaseUrl, string Username, string Password) GetSettings()
    {
        if (TryGetConfigurationError(out var error))
        {
            throw new NxConfigurationException(error!);
        }

        var section = _configuration.GetSection("NxRest");
        return ($"https://{section["Host"]}:{section["Port"]}", section["Username"]!, section["Password"]!);
    }

    private static string? GetString(JsonObject item, string property) =>
        item.TryGetPropertyValue(property, out var value) ? value?.ToString() : null;
}

/// <summary>Ошибка обращения к Nx.</summary>
public class NxException(string message, System.Net.HttpStatusCode? statusCode = null) : Exception(message)
{
    public System.Net.HttpStatusCode? StatusCode { get; } = statusCode;
}

/// <summary>Nx не настроен в конфигурации — правки портала сохраняются, синхронизация пропускается.</summary>
public sealed class NxConfigurationException(string message) : NxException(message);
