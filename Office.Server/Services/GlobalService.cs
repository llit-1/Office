using Cronos;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Services;

/// <summary>Общие функции, которые нужны сразу нескольким разделам Office.</summary>
public sealed class GlobalService(RKNETDBContext db)
{
    /// <summary>
    /// Действующие (Actual = 1) локации пользователя: привязанные к нему, а при DefaultLocations = 1 — все.
    /// Для неизвестного пользователя список пустой.
    /// </summary>
    public async Task<List<Location>> GetUserLocationsAsync(int userId, CancellationToken cancellationToken = default)
    {
        var defaultLocations = await db.OfficeUser
            .AsNoTracking()
            .Where(x => x.Id == userId)
            .Select(x => (int?)x.DefaultLocations)
            .FirstOrDefaultAsync(cancellationToken);
        if (defaultLocations is null)
            return [];

        var locations = defaultLocations == 1
            ? db.Locations.AsNoTracking()
            : db.OfficeUser.AsNoTracking().Where(x => x.Id == userId).SelectMany(x => x.Locations);

        return await locations.Where(x => x.Actual == 1).OrderBy(x => x.Name).ToListAsync(cancellationToken);
    }

    /// <summary>
    /// Ближайшие <paramref name="count"/> срабатываний крона начиная с <paramref name="from"/> включительно,
    /// от меньшего к большему. Время — местное время сервера. Некорректный крон — CronFormatException.
    /// </summary>
    public static List<DateTime> GetNextCronOccurrences(string cron, DateTime from, int count)
    {
        var expression = CronExpression.Parse(cron);
        var result = new List<DateTime>(count);
        var cursorUtc = ToUtc(from);
        var inclusive = true;
        while (result.Count < count
            && expression.GetNextOccurrence(cursorUtc, TimeZoneInfo.Local, inclusive) is DateTime nextUtc)
        {
            result.Add(ToLocal(nextUtc));
            cursorUtc = nextUtc;
            inclusive = false;
        }

        return result;
    }

    /// <summary>Попадает ли <paramref name="moment"/> точно на срабатывание крона.</summary>
    public static bool IsCronOccurrence(string cron, DateTime moment) =>
        GetNextCronOccurrences(cron, moment, 1) is [var next] && next == moment;

    /// <summary>Последнее срабатывание крона строго раньше <paramref name="before"/>; null — такого нет.</summary>
    public static DateTime? GetPreviousCronOccurrence(string cron, DateTime before)
    {
        var expression = CronExpression.Parse(cron);
        var beforeUtc = ToUtc(before);

        // Cronos не умеет искать назад: расширяем окно, пока в него не попадёт срабатывание.
        foreach (var days in new[] { 2, 32, 367, 1500 })
        {
            var occurrences = expression.GetOccurrences(beforeUtc.AddDays(-days), beforeUtc, TimeZoneInfo.Local).ToList();
            if (occurrences.Count > 0)
                return ToLocal(occurrences[^1]);
        }

        return null;
    }

    private static DateTime ToUtc(DateTime local) =>
        TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(local, DateTimeKind.Unspecified), TimeZoneInfo.Local);

    // Kind = Unspecified, как у дат из БД: в JSON уходит местное время без смещения.
    private static DateTime ToLocal(DateTime utc) =>
        DateTime.SpecifyKind(TimeZoneInfo.ConvertTimeFromUtc(utc, TimeZoneInfo.Local), DateTimeKind.Unspecified);
}
