using System.DirectoryServices;
using System.Runtime.InteropServices;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Office.Server.DbContexts.RKNETDB;

namespace Office.Server.Controllers;

/// <summary>
/// Учётки точек, оформленные в AD не по формату: Фамилия «Розница», Имя — название ТТ, без отчества,
/// Должность «Пекарня». Учётка точки — та, что лежит в OU розницы. Проверяются значения AD, а не базы:
/// править их нужно в AD, а в базу они попадают только при входе.
/// </summary>
[Route("api/User/tradepoint-format")]
[ApiController]
[Authorize(Roles = "Users")]
public class TradePointAccountsController(
    RKNETDBContext db,
    IMemoryCache cache,
    IConfiguration configuration,
    ILogger<TradePointAccountsController> logger) : ControllerBase
{
    public const string Surname = "Розница";
    public const string Position = "Пекарня";
    private const string DefaultOrganizationalUnit = "OU=Roznitsa,OU=LL,DC=shzhleb,DC=ru";
    private const string CacheKey = "tradepoint-accounts";
    // AD is not asked on every page open; a fix made there shows up here within this time.
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(10);

    [HttpGet]
    public async Task<ActionResult<List<TradePointFormatIssueDto>>> GetIssues(CancellationToken cancellationToken)
    {
        IReadOnlyList<TradePointDirectoryAccount> accounts;
        try
        {
            accounts = (await cache.GetOrCreateAsync(CacheKey, entry =>
            {
                entry.AbsoluteExpirationRelativeToNow = CacheLifetime;
                return Task.FromResult(LoadDirectoryAccounts());
            }))!;
        }
        catch (Exception exception) when (exception is COMException or InvalidOperationException)
        {
            logger.LogWarning(exception, "Trade point accounts could not be read from AD.");
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Не удалось получить учётки точек из AD." });
        }

        var byLogin = accounts
            .GroupBy(account => account.Login.Trim(), StringComparer.OrdinalIgnoreCase)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.OrdinalIgnoreCase);

        var users = await db.OfficeUser.AsNoTracking()
            .Select(user => new { user.Id, user.Login })
            .ToListAsync(cancellationToken);

        return users
            .Where(user => byLogin.ContainsKey(user.Login.Trim()))
            .Select(user => new TradePointFormatIssueDto(user.Id, user.Login, Check(byLogin[user.Login.Trim()])))
            .Where(issue => issue.Issues.Count > 0)
            .OrderBy(issue => issue.Login, StringComparer.OrdinalIgnoreCase)
            .ToList();
    }

    public static IReadOnlyList<string> Check(TradePointDirectoryAccount account)
    {
        var issues = new List<string>();
        var surname = account.Surname?.Trim();
        var name = account.Name?.Trim();

        if (surname != Surname)
            issues.Add(string.IsNullOrEmpty(surname) ? "фамилия пустая" : $"фамилия «{surname}» вместо «{Surname}»");

        if (string.IsNullOrEmpty(name))
            issues.Add("имя пустое, нужно название ТТ");
        else if (name.Contains(Surname, StringComparison.OrdinalIgnoreCase))
            issues.Add($"в имени «{name}» вместо названия ТТ");

        if (!string.IsNullOrWhiteSpace(account.Patronymic))
            issues.Add("отчество должно быть пустым");

        if (account.Position?.Trim() != Position)
            issues.Add(string.IsNullOrWhiteSpace(account.Position)
                ? $"должность пустая вместо «{Position}»"
                : $"должность «{account.Position.Trim()}» вместо «{Position}»");

        return issues;
    }

    protected virtual IReadOnlyList<TradePointDirectoryAccount> LoadDirectoryAccounts()
    {
        var ou = configuration["TradePointAccounts:OrganizationalUnit"] ?? DefaultOrganizationalUnit;
        using var root = new DirectoryEntry($"LDAP://{ou}");
        using var searcher = new DirectorySearcher(root, "(&(objectCategory=person)(objectClass=user))")
        {
            PageSize = 500,
            SearchScope = SearchScope.Subtree
        };
        searcher.PropertiesToLoad.AddRange(["sAMAccountName", "sn", "givenName", "middleName", "title"]);

        using var results = searcher.FindAll();
        return results.Cast<SearchResult>()
            .Select(result => new TradePointDirectoryAccount(
                Read(result, "sAMAccountName") ?? string.Empty,
                Read(result, "sn"),
                Read(result, "givenName"),
                Read(result, "middleName"),
                Read(result, "title")))
            .Where(account => account.Login.Length > 0)
            .ToList();

        static string? Read(SearchResult result, string property) =>
            result.Properties[property] is { Count: > 0 } values ? values[0]?.ToString() : null;
    }
}

public sealed record TradePointDirectoryAccount(string Login, string? Surname, string? Name, string? Patronymic, string? Position);

public sealed record TradePointFormatIssueDto(int UserId, string Login, IReadOnlyList<string> Issues);
