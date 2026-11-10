using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Security;

/// <summary>
/// Взаимоисключающие роли: из ролей с одинаковым <see cref="OfficeRole.ExclusiveKey"/> группе,
/// а пользователю — по всем его группам вместе, можно дать только одну.
/// </summary>
public static class RoleConflicts
{
    /// <summary>Роль и группа, из которой она досталась.</summary>
    public sealed record GrantedRole(OfficeRole Role, string Group);

    public sealed record Conflict(GrantedRole First, GrantedRole Second);

    /// <summary>Пустой ключ — роль ни с чем не конфликтует.</summary>
    public static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    /// <summary>Первая пара противоречащих ролей или null. Одна и та же роль из разных групп противоречием не считается.</summary>
    public static Conflict? Find(IEnumerable<GrantedRole> roles) => All(roles).FirstOrDefault();

    /// <summary>
    /// Первое противоречие, которого не было до правки. Старые, из времён без проверки,
    /// не должны мешать постороннему изменению: их убирают отдельно.
    /// </summary>
    public static Conflict? FindNew(IEnumerable<GrantedRole> before, IEnumerable<GrantedRole> after)
    {
        var known = All(before).Select(Pair).ToHashSet();
        return All(after).FirstOrDefault(conflict => !known.Contains(Pair(conflict)));
    }

    /// <summary>Роли одной группы.</summary>
    public static Conflict? FindInGroup(IEnumerable<OfficeRole> roles, string group) =>
        Find(InGroup(roles, group));

    /// <summary>Новое противоречие в ролях группы.</summary>
    public static Conflict? FindNewInGroup(IEnumerable<OfficeRole> before, IEnumerable<OfficeRole> after, string group) =>
        FindNew(InGroup(before, group), InGroup(after, group));

    /// <summary>Роли пользователя из всех его групп.</summary>
    public static Conflict? FindForUser(IEnumerable<OfficeGroup> groups) =>
        Find(ForUser(groups));

    /// <summary>Новое противоречие в ролях пользователя.</summary>
    public static Conflict? FindNewForUser(IEnumerable<OfficeGroup> before, IEnumerable<OfficeGroup> after) =>
        FindNew(ForUser(before), ForUser(after));

    private static IEnumerable<GrantedRole> InGroup(IEnumerable<OfficeRole> roles, string group) =>
        roles.Select(role => new GrantedRole(role, group));

    private static IEnumerable<GrantedRole> ForUser(IEnumerable<OfficeGroup> groups) =>
        groups.SelectMany(group => InGroup(group.OfficeRole, group.Name));

    private static IEnumerable<Conflict> All(IEnumerable<GrantedRole> roles)
    {
        var byKey = new Dictionary<string, List<GrantedRole>>(StringComparer.OrdinalIgnoreCase);
        foreach (var granted in roles)
        {
            if (Normalize(granted.Role.ExclusiveKey) is not string key)
                continue;
            if (!byKey.TryGetValue(key, out var earlier))
                byKey[key] = earlier = [];
            foreach (var other in earlier.Where(other => other.Role.ID != granted.Role.ID))
                yield return new Conflict(other, granted);
            earlier.Add(granted);
        }
    }

    private static (int, int) Pair(Conflict conflict) =>
        (Math.Min(conflict.First.Role.ID, conflict.Second.Role.ID), Math.Max(conflict.First.Role.ID, conflict.Second.Role.ID));

    /// <summary>Текст для пользователя: какие роли и откуда.</summary>
    public static string Describe(Conflict conflict)
    {
        var (first, second) = (conflict.First, conflict.Second);
        return first.Group == second.Group
            ? $"Роли «{first.Role.Name}» и «{second.Role.Name}» взаимоисключающие: в группе «{first.Group}» может быть только одна из них."
            : $"Роли «{first.Role.Name}» (группа «{first.Group}») и «{second.Role.Name}» (группа «{second.Group}») взаимоисключающие: у пользователя может быть только одна из них.";
    }
}
