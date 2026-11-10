using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.Calculator;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Calculator;

/// <summary>Расчёт категории на точке: что посчитали и в каком периоде.</summary>
public sealed record CalculatorSheet(
    CalculatorCategories.Category Category,
    CalcItemsGroup Group,
    PeriodPlan Periods,
    int Reaction,
    CalculatorResult Result);

/// <summary>Текущий период категории — для главной страницы калькуляторов.</summary>

/// <summary>Загрузка данных калькулятора из CALCULATOR и последних вводов из RKNET.</summary>
public sealed class CalculatorService(CalculatorDbContext calc, RKNETDBContext rknet)
{
    public async Task<CalculatorSheet?> BuildAsync(CalculatorCategories.Category category, int ttCode, DateTime now, CancellationToken ct = default)
    {
        var group = await calc.ItemsGroups.AsNoTracking().FirstOrDefaultAsync(x => x.Guid == category.Group, ct);
        if (group is null)
            return null;

        var timeGroups = await calc.TimeGroups.AsNoTracking().Where(x => x.ItemsGroup == group.Guid).ToListAsync(ct);
        var periods = await ResolvePeriodsAsync(timeGroups, now, ct);
        if (periods is null)
            return null;

        var slotGroups = new[] { periods.This, periods.Next, periods.Second }.Select(x => x.TimeGroup.Guid).Distinct().ToList();
        var coefficients = await calc.PeriodCoefficients.AsNoTracking()
            .Where(x => x.TTCode == ttCode && slotGroups.Contains(x.TimeGroupGuid))
            .ToDictionaryAsync(x => x.TimeGroupGuid, x => x.Coefficient, ct);

        var groupItems = await calc.Items.AsNoTracking()
            .Where(x => x.ItemsGroup == group.Guid)
            .OrderBy(x => x.Sequence).ThenBy(x => x.RkCode)
            .ToListAsync(ct);
        var groupCodes = groupItems.Select(x => x.RkCode).ToList();

        var replacements = await calc.Replacements.AsNoTracking()
            .Where(x => x.Begin < now && x.End > now
                && ((x.ItemCode != null && groupCodes.Contains(x.ItemCode.Value)) || x.TTCode == ttCode))
            .ToListAsync(ct);
        var extraCodes = replacements.Where(x => x.ReplacementItemCode != null).Select(x => x.ReplacementItemCode!.Value)
            .Except(groupCodes).ToList();
        var extraItems = extraCodes.Count == 0
            ? []
            : await calc.Items.AsNoTracking().Where(x => extraCodes.Contains(x.RkCode)).ToListAsync(ct);
        var itemsByCode = groupItems.Concat(extraItems).ToDictionary(x => x.RkCode);
        var itemCodes = itemsByCode.Keys.ToList();

        var ttCodes = replacements.Where(x => x.TTCode == ttCode && x.ReplacementTTCode != null)
            .Select(x => x.ReplacementTTCode!.Value).Append(ttCode).Distinct().ToList();
        var itemsOnTT = await calc.ItemOnTT.AsNoTracking()
            .Where(x => ttCodes.Contains(x.TTCode) && itemCodes.Contains(x.ItemRkCode))
            .ToListAsync(ct);

        var onTTGuids = itemsOnTT.Select(x => x.Guid).ToList();
        var slots = new[] { periods.This, periods.Next, periods.Second }.Select(x => x.TimeDayGroup.Guid).Distinct().ToList();
        var sales = await calc.Sales.AsNoTracking()
            .Where(x => slots.Contains(x.TimeDayGroupsGUID) && onTTGuids.Contains(x.ItemOnTTGUID))
            .ToListAsync(ct);

        var blocks = await calc.ItemBlocks.AsNoTracking()
            .Where(x => x.Enable && x.Begin <= now && x.End >= now
                && (x.TTCode == null || x.TTCode == ttCode)
                && groupCodes.Contains(x.ItemRkCode))
            .ToListAsync(ct);

        var reaction = await ReactionAsync(group.Guid, now.Hour, ct);
        var result = CalculatorEngine.Build(new CalculatorSources
        {
            Now = now,
            TTCode = ttCode,
            Group = group,
            Periods = periods,
            Coefficients = coefficients,
            GroupItems = groupItems,
            ItemsByCode = itemsByCode,
            ItemsOnTT = itemsOnTT,
            Replacements = replacements,
            Sales = sales,
            Blocks = blocks,
        });
        return new CalculatorSheet(category, group, periods, reaction, result);
    }

    /// <summary>
    /// Вводы точки начиная с <paramref name="since"/>. В таблице индекс только по Id, поэтому сначала
    /// находим последнюю строку раньше <paramref name="since"/> (сканирование с конца короткое), дальше — диапазон Id.
    /// </summary>
    public async Task<List<CalculatorLogEntry>> LogsSinceAsync(int ttCode, DateTime since, CancellationToken ct = default)
    {
        var lastBefore = await rknet.CalculatorLogs.AsNoTracking()
            .Where(x => x.Date < since)
            .OrderByDescending(x => x.Id)
            .Select(x => (int?)x.Id)
            .FirstOrDefaultAsync(ct) ?? 0;
        return await rknet.CalculatorLogs.AsNoTracking()
            .Where(x => x.Id > lastBefore && x.TTCode == ttCode && x.Date >= since)
            .OrderBy(x => x.Id)
            .ToListAsync(ct);
    }

    private async Task<PeriodPlan?> ResolvePeriodsAsync(List<CalcTimeGroup> timeGroups, DateTime now, CancellationToken ct)
    {
        var dayGroups = await calc.DayGroups.AsNoTracking().ToListAsync(ct);
        var today = now.Date;
        var tomorrow = today.AddDays(1);
        var specials = await calc.SpecialDays.AsNoTracking()
            .Where(x => x.Date == today || x.Date == tomorrow)
            .ToListAsync(ct);
        CalcDayGroup? Special(DateTime day) =>
            specials.FirstOrDefault(x => x.Date.Date == day) is { DayGroupsGuid: Guid guid }
                ? dayGroups.FirstOrDefault(x => x.Guid == guid)
                : null;

        var days = CalculatorPeriods.ResolveDays(now, dayGroups, Special(today), Special(tomorrow));
        if (days is null)
            return null;
        var timeGroupIds = timeGroups.Select(x => x.Guid).ToList();
        var timeDayGroups = await calc.TimeDayGroups.AsNoTracking().Where(x => timeGroupIds.Contains(x.TimeGroupGuid)).ToListAsync(ct);
        return CalculatorPeriods.Resolve(now, timeGroups, days.Value.Today, days.Value.Tomorrow, timeDayGroups);
    }

    private async Task<int> ReactionAsync(Guid group, int hour, CancellationToken ct) =>
        await calc.Reactions.AsNoTracking()
            .Where(x => x.ItemsGroup == group && x.FirstHour <= hour && x.LastHour >= hour)
            .Select(x => (int?)x.Reaction)
            .FirstOrDefaultAsync(ct) ?? 0;
}
