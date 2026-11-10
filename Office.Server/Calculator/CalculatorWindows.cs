using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Calculator;

/// <summary>Окно захода: [Start, End) в минутах от начала суток.</summary>
public sealed record EntryWindow(int Start, int End)
{
    public string Label => $"{Format(Start)}–{Format(End)}";

    public static string Format(int minute) => $"{minute / 60 % 24:00}:{minute % 60:00}";
}

/// <summary>Где мы относительно окон захода: в окне или ждём следующего.</summary>
public sealed record WindowState(EntryWindow? Current, DateTime? CurrentStart, EntryWindow? Next, DateTime? NextStart);

public static class CalculatorWindows
{
    public static WindowState Resolve(IReadOnlyList<EntryWindow> windows, DateTime now)
    {
        var minute = now.Hour * 60 + now.Minute;
        var ordered = windows.OrderBy(x => x.Start).ToList();
        var current = ordered.FirstOrDefault(x => x.Start <= minute && minute < x.End);
        var next = ordered.FirstOrDefault(x => x.Start > minute);
        DateTime? nextStart = next is null ? null : now.Date.AddMinutes(next.Start);
        if (next is null && ordered.Count > 0)
        {
            next = ordered[0];
            nextStart = now.Date.AddDays(1).AddMinutes(next.Start);
        }
        return new WindowState(current, current is null ? null : now.Date.AddMinutes(current.Start), next, nextStart);
    }

    /// <summary>Окна категории для точки: свои, если заданы, иначе общие.</summary>
    public static IReadOnlyList<EntryWindow> For(IEnumerable<OfficeCalculatorEntryWindow> all, string category, int tt)
    {
        var mine = all.Where(x => x.Category == category).ToList();
        var own = mine.Where(x => x.TTCode == tt).ToList();
        return (own.Count > 0 ? own : mine.Where(x => x.TTCode == null))
            .Select(x => new EntryWindow(x.StartMinute, x.EndMinute))
            .OrderBy(x => x.Start)
            .ToList();
    }

    public static Task<List<OfficeCalculatorEntryWindow>> LoadAsync(RKNETDBContext db, int? tt, CancellationToken ct) =>
        db.OfficeCalculatorEntryWindows.AsNoTracking()
            .Where(x => x.TTCode == null || x.TTCode == tt)
            .ToListAsync(ct);
}

/// <summary>
/// Создаёт таблицу окон захода, если её нет, и один раз заполняет окнами по статистике заходов
/// (CalculatorLogsTest, 8 недель до 16.10.2026). Существующие окна не трогает.
/// </summary>
public sealed class CalculatorWindowsInitializer(RKNETDBContext db)
{
    // круглосуточные точки: утро делают около 03:00, сэндвичи — около 01:00
    private static readonly int[] NightStores = [1025482, 1022284, 1022028, 1023691, 1021187, 1024782, 1020428, 1022743];

    public static IReadOnlyList<OfficeCalculatorEntryWindow> Defaults()
    {
        static OfficeCalculatorEntryWindow W(string category, int? tt, int from, int to) =>
            new() { Category = category, TTCode = tt, StartMinute = from, EndMinute = to };
        const int h = 60;

        var result = new List<OfficeCalculatorEntryWindow>();
        foreach (var bakeryLike in new[] { "bread", "bakery" })
        {
            result.Add(W(bakeryLike, null, 5 * h + 30, 7 * h + 30));
            result.Add(W(bakeryLike, null, 9 * h + 30, 12 * h));
            result.Add(W(bakeryLike, null, 15 * h + 30, 17 * h));
        }
        result.Add(W("confectionery", null, 13 * h + 30, 15 * h + 15));
        result.Add(W("confectionery", null, 21 * h, 23 * h));
        result.Add(W("sandwiches", null, 5 * h + 30, 7 * h + 30));
        result.Add(W("sandwiches", null, 12 * h + 30, 14 * h + 15));
        result.Add(W("other", null, 21 * h, 23 * h));

        foreach (var tt in NightStores)
        {
            foreach (var bakeryLike in new[] { "bread", "bakery" })
            {
                result.Add(W(bakeryLike, tt, 2 * h, 4 * h + 30));
                result.Add(W(bakeryLike, tt, 9 * h + 30, 12 * h));
                result.Add(W(bakeryLike, tt, 15 * h + 30, 17 * h));
            }
            result.Add(W("sandwiches", tt, 0, 2 * h));
            result.Add(W("sandwiches", tt, 12 * h + 30, 14 * h + 15));
        }
        return result;
    }

    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        const string sql = """
IF OBJECT_ID(N'[dbo].[OfficeCalculatorEntryWindows]', N'U') IS NULL
BEGIN
    CREATE TABLE [dbo].[OfficeCalculatorEntryWindows](
        [Id] int IDENTITY(1,1) NOT NULL CONSTRAINT [PK_OfficeCalculatorEntryWindows] PRIMARY KEY,
        [Category] nvarchar(32) NOT NULL,
        [TTCode] int NULL,
        [StartMinute] int NOT NULL,
        [EndMinute] int NOT NULL,
        CONSTRAINT [CK_OfficeCalculatorEntryWindows_Range] CHECK ([StartMinute] >= 0 AND [StartMinute] < [EndMinute] AND [EndMinute] <= 1440)
    );
    CREATE INDEX [IX_OfficeCalculatorEntryWindows_Category_TT] ON [dbo].[OfficeCalculatorEntryWindows]([Category], [TTCode]);
END;
""";
        await db.Database.ExecuteSqlRawAsync(sql, cancellationToken);
        if (await db.OfficeCalculatorEntryWindows.AnyAsync(cancellationToken))
            return;
        db.OfficeCalculatorEntryWindows.AddRange(Defaults());
        await db.SaveChangesAsync(cancellationToken);
    }
}
