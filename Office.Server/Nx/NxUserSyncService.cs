using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Nx;

/// <summary>
/// Синхронизация групп пользователя в Nx Witness с его настройками ТТ в портале.
/// Логика повторяет портал: «Все ТТ» → группа ALLTT, иначе группа (Locations.NXLayout) на каждую выбранную ТТ.
/// Группы, выданные в Nx вручную, не трогаем — изменяем только управляемые порталом.
/// </summary>
public sealed class NxUserSyncService(NxRestClient nxClient, RKNETDBContext db, ILogger<NxUserSyncService> logger)
{
    /// <summary>Код роли, дающей доступ к видеонаблюдению.</summary>
    public const string RoleCode = "NX";

    private const string AllTtGroupName = "ALLTT";

    /// <summary>Типы локаций, для которых отсутствие NXLayout — ошибка, а не повод пропустить ТТ.</summary>
    private static readonly HashSet<Guid> NxLayoutRequiredLocationTypes =
    [
        Guid.Parse("94AD659C-AF5B-4CA0-50AD-08DBDF6ABE84"),
        Guid.Parse("B0E427F9-8996-4C03-33C1-08DBDF713401"),
    ];

    public static bool HasNxRole(OfficeUser user) =>
        user.OfficeGroup.Any(group => group.OfficeRole.Any(role =>
            string.Equals(role.Role, RoleCode, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(role.Name, RoleCode, StringComparison.OrdinalIgnoreCase)));

    /// <summary>
    /// Приводит доступы пользователя в Nx к текущим настройкам портала и возвращает предупреждения
    /// (пользователя нет в Nx, Nx не настроен, не хватает прав) — они не отменяют сохранение.
    /// Прочие ошибки Nx бросаются наружу: сохранять доступы только на портале нельзя.
    /// </summary>
    public async Task<List<string>> SyncUserAsync(OfficeUser user, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(user.Login))
        {
            throw new NxException("Логин пользователя пустой. Невозможно синхронизировать NX.");
        }

        if (nxClient.TryGetConfigurationError(out var configurationError))
        {
            return [$"NX не настроен ({configurationError}). Изменения применены только на портале."];
        }

        try
        {
            var nxUsers = await nxClient.GetUsersAsync(cancellationToken);

            if (!NxRestClient.UserExists(user.Login, nxUsers))
            {
                // Пользователя в Nx нет: если доступ снимается — тем более нечего делать.
                return [$"Пользователь «{user.Login}» не найден в NX, изменения применены только на портале."];
            }

            var nxGroups = await nxClient.GetUserGroupsAsync(cancellationToken);
            var managedGroupIds = await GetManagedGroupIdsAsync(nxGroups, cancellationToken);
            var keepsAccess = user.Actual != 0 && HasNxRole(user);
            var requiredGroupIds = keepsAccess
                ? GetRequiredGroupIds(user, nxGroups)
                : [];

            await nxClient.SyncUserGroupsAsync(user.Login, requiredGroupIds, managedGroupIds, cancellationToken);

            return [];
        }
        catch (NxConfigurationException ex)
        {
            return [$"NX не настроен ({ex.Message}). Изменения применены только на портале."];
        }
        catch (NxException ex) when (IsAdministratorRightsForbidden(ex))
        {
            logger.LogWarning(ex, "NX sync skipped for administrator account {Login}", user.Login);
            return [$"Пользователь «{user.Login}» имеет администраторские права в NX, изменения применены только на портале."];
        }
    }

    /// <summary>
    /// ТТ меняет группу в Nx: её пользователи переходят в новую. Вызывается до сохранения ТТ, а прежняя группа
    /// снимается явно: после сохранения она перестаёт быть управляемой и осталась бы у них навсегда.
    /// Пользователи «Все ТТ» не затрагиваются. Предупреждения и ошибки — как в <see cref="SyncUserAsync"/>.
    /// </summary>
    public async Task<List<string>> MoveLocationUsersAsync(
        Guid locationGuid,
        Guid? previousLayout,
        Guid? newLayout,
        CancellationToken cancellationToken = default)
    {
        var users = (await db.OfficeUser
                .AsNoTracking()
                .Include(user => user.Locations)
                .Include(user => user.OfficeGroup)
                    .ThenInclude(group => group.OfficeRole)
                .Where(user => user.Actual != 0
                    && user.DefaultLocations != 1
                    && user.Locations.Any(location => location.Guid == locationGuid))
                .ToListAsync(cancellationToken))
            .Where(HasNxRole)
            .ToList();

        if (users.Count == 0)
        {
            return [];
        }

        if (nxClient.TryGetConfigurationError(out var configurationError))
        {
            return [$"NX не настроен ({configurationError}). Изменения применены только на портале."];
        }

        var warnings = new List<string>();
        try
        {
            var nxUsers = await nxClient.GetUsersAsync(cancellationToken);
            var nxGroups = await nxClient.GetUserGroupsAsync(cancellationToken);
            var managedGroupIds = await GetManagedGroupIdsAsync(nxGroups, cancellationToken);
            if (previousLayout is Guid previous)
            {
                managedGroupIds.Add(previous);
            }

            foreach (var user in users)
            {
                if (!NxRestClient.UserExists(user.Login, nxUsers))
                {
                    warnings.Add($"Пользователь «{user.Login}» не найден в NX, изменения применены только на портале.");
                    continue;
                }

                foreach (var location in user.Locations.Where(location => location.Guid == locationGuid))
                {
                    location.NXLayout = newLayout;
                }

                try
                {
                    // ТТ без группы здесь не ошибка: её и отвязывают, а другие ТТ пользователя править не просили.
                    var requiredGroupIds = GetRequiredGroupIds(user, nxGroups, layoutRequired: false);
                    await nxClient.SyncUserGroupsAsync(user.Login, requiredGroupIds, managedGroupIds, cancellationToken);
                }
                catch (NxException ex) when (IsAdministratorRightsForbidden(ex))
                {
                    logger.LogWarning(ex, "NX sync skipped for administrator account {Login}", user.Login);
                    warnings.Add($"Пользователь «{user.Login}» имеет администраторские права в NX, изменения применены только на портале.");
                }
            }
        }
        catch (NxConfigurationException ex)
        {
            return [$"NX не настроен ({ex.Message}). Изменения применены только на портале."];
        }

        return warnings;
    }

    private List<Guid> GetRequiredGroupIds(OfficeUser user, List<NxRestClient.NxItemInfo> nxGroups, bool layoutRequired = true)
    {
        if (user.DefaultLocations == 1)
        {
            var allTtGroupId = FindAllTtGroupId(nxGroups)
                ?? throw new NxException("В NX не найдена группа ALLTT. Изменения не применены.");

            return [allTtGroupId];
        }

        var requiredGroupIds = new List<Guid>();

        foreach (var location in user.Locations)
        {
            if (location.NXLayout is Guid layout)
            {
                requiredGroupIds.Add(layout);
                continue;
            }

            var requiresLayout = layoutRequired
                && location.Actual == 1
                && location.LocationTypeGuid is Guid typeGuid
                && NxLayoutRequiredLocationTypes.Contains(typeGuid);

            if (requiresLayout)
            {
                throw new NxException($"Для ТТ {location.Name} не найден NXLayout. Изменения не применены.");
            }
        }

        return requiredGroupIds.Distinct().ToList();
    }

    /// <summary>Группы, которыми управляет портал: разметки всех ТТ плюс ALLTT.</summary>
    private async Task<List<Guid>> GetManagedGroupIdsAsync(
        List<NxRestClient.NxItemInfo> nxGroups,
        CancellationToken cancellationToken)
    {
        var managedGroupIds = await db.Locations
            .AsNoTracking()
            .Where(location => location.NXLayout != null)
            .Select(location => location.NXLayout!.Value)
            .Distinct()
            .ToListAsync(cancellationToken);

        if (FindAllTtGroupId(nxGroups) is Guid allTtGroupId)
        {
            managedGroupIds.Add(allTtGroupId);
        }

        return managedGroupIds.Distinct().ToList();
    }

    private static Guid? FindAllTtGroupId(List<NxRestClient.NxItemInfo> nxGroups)
    {
        var allTtGroup = nxGroups.FirstOrDefault(group =>
            string.Equals(group.Name?.Trim(), AllTtGroupName, StringComparison.OrdinalIgnoreCase));

        return Guid.TryParse(allTtGroup?.Id, out var id) ? id : null;
    }

    private static bool IsAdministratorRightsForbidden(NxException ex) =>
        ex.Message.Contains("is not permitted to modify User", StringComparison.OrdinalIgnoreCase)
        && ex.Message.Contains("administrator", StringComparison.OrdinalIgnoreCase);
}
