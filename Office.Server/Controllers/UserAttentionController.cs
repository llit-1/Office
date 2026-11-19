using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;

namespace Office.Server.Controllers;

/// <summary>
/// Активные учётки, на которые админу пользователей стоит посмотреть: без доступа и давно не заходили.
/// Неактивные сюда не входят: их и так видно в карточке. Формат учёток точек проверяет <see cref="TradePointAccountsController"/>.
/// </summary>
[Route("api/User/attention")]
[ApiController]
[Authorize(Roles = "Users")]
public class UserAttentionController(RKNETDBContext db) : ControllerBase
{
    public const int StaleDays = 90;

    // Roles that show data only for the user's trade points: without points (and without «Все ТТ») they show nothing.
    private static readonly string[] LocationRoles = ["Calculator", "Order_man", "Order_woman", "Menu", "NX", "ReportsFranchisee"];

    [HttpGet]
    public async Task<ActionResult<UserAttentionDto>> Get(CancellationToken cancellationToken)
    {
        var users = await db.OfficeUser.AsNoTracking()
            .Select(user => new
            {
                user.Id,
                user.Actual,
                user.DefaultLocations,
                HasGroups = user.OfficeGroup.Any(),
                Roles = user.OfficeGroup.SelectMany(group => group.OfficeRole).Select(role => role.Role).ToList(),
                HasLocations = user.Locations.Any(),
            })
            .ToListAsync(cancellationToken);

        var lastLogins = await db.OfficeAuthLogs.AsNoTracking()
            .GroupBy(log => log.OfficeUserId)
            .Select(group => new { UserId = group.Key, Last = group.Max(log => log.LoggedDate) })
            .ToDictionaryAsync(x => x.UserId, x => x.Last, cancellationToken);

        var noAccess = new List<UserAttentionReasonDto>();
        var stale = new List<UserAttentionReasonDto>();
        // Auth log dates are Moscow server-local time, so compare with local now.
        var staleBefore = Now().AddDays(-StaleDays);

        foreach (var user in users.Where(user => user.Actual == 1))
        {
            if (!user.HasGroups)
            {
                noAccess.Add(new(user.Id, "нет ни одной группы"));
            }
            else if (user.DefaultLocations != 1 && !user.HasLocations)
            {
                var needPoints = user.Roles
                    .Select(role => role?.Trim())
                    .Any(role => LocationRoles.Contains(role, StringComparer.OrdinalIgnoreCase));
                if (needPoints)
                    noAccess.Add(new(user.Id, "нет торговых точек"));
            }

            // Never signed in is not "stale": such accounts are usually fresh ones waiting for their first login.
            if (lastLogins.TryGetValue(user.Id, out var last) && last < staleBefore)
                stale.Add(new(user.Id, $"последний вход {last:dd.MM.yyyy}"));
        }

        return new UserAttentionDto(noAccess, stale);
    }

    protected virtual DateTime Now() => DateTime.Now;
}

public sealed record UserAttentionReasonDto(int UserId, string Reason);

public sealed record UserAttentionDto(
    IReadOnlyList<UserAttentionReasonDto> NoAccess,
    IReadOnlyList<UserAttentionReasonDto> Stale);
