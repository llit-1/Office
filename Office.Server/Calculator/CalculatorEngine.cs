using Office.Server.DbContexts.Calculator;

namespace Office.Server.Calculator;

/// <summary>Категории калькулятора: адрес в портале и группа товаров в базе CALCULATOR.</summary>
public static class CalculatorCategories
{
    public sealed record Category(string Slug, string Title, Guid Group);

    public static readonly IReadOnlyList<Category> All =
    [
        new("bread", "Хлеб", Guid.Parse("43E2F47F-8729-49C6-8507-64DFEDBC6BBC")),
        new("bakery", "Выпечка", Guid.Parse("573B9B93-41A1-4ACA-B740-A98CEF77E935")),
        new("confectionery", "Кондитерские изделия", Guid.Parse("9FA5B2FC-91F1-4771-BF06-F7C3E7E37359")),
        new("sandwiches", "Сэндвичи", Guid.Parse("9C42DDD0-3ABE-4105-AFA1-BFDA989C3836")),
        new("other", "Прочий ассортимент", Guid.Parse("06BE0412-8D99-4111-99A9-98172E0D3930")),
    ];

    public static Category? Find(string? slug) =>
        All.FirstOrDefault(x => string.Equals(x.Slug, slug, StringComparison.OrdinalIgnoreCase));
}

/// <summary>Период и группа дней, по которым берутся продажи.</summary>
public sealed record PeriodSlot(CalcTimeGroup TimeGroup, CalcDayGroup DayGroup, CalcTimeDayGroup TimeDayGroup);

/// <summary>Текущий период и два следующих: калькулятор печёт на 1–3 из них (Reaction).</summary>
public sealed record PeriodPlan(PeriodSlot This, PeriodSlot Next, PeriodSlot Second);

/// <summary>Выбор периодов — как в старом портале.</summary>
public static class CalculatorPeriods
{
    /// <summary>Группа дней сегодня и завтра; особый день (праздник) подменяет обычную группу.</summary>
    public static (CalcDayGroup Today, CalcDayGroup Tomorrow)? ResolveDays(
        DateTime now, IReadOnlyList<CalcDayGroup> dayGroups, CalcDayGroup? specialToday, CalcDayGroup? specialTomorrow)
    {
        var ordered = dayGroups.OrderBy(x => x.FirstDay).ToList();
        var dow = (int)now.DayOfWeek;
        CalcDayGroup? today = null, tomorrow = null;
        for (var i = 0; i < ordered.Count; i++)
        {
            if (ordered[i].FirstDayUS > dow || ordered[i].LastDayUS < dow)
                continue;
            today = ordered[i];
            // завтра — та же группа, если сегодня не её последний день
            tomorrow = today.LastDayUS != dow ? today : ordered[(i + 1) % ordered.Count];
            break;
        }
        today = specialToday ?? today;
        tomorrow = specialTomorrow ?? tomorrow;
        return today is null || tomorrow is null ? null : (today, tomorrow);
    }

    public static PeriodPlan? Resolve(
        DateTime now,
        IReadOnlyList<CalcTimeGroup> timeGroups,
        CalcDayGroup today,
        CalcDayGroup tomorrow,
        IReadOnlyList<CalcTimeDayGroup> timeDayGroups)
    {
        var groups = timeGroups.OrderBy(x => x.FirstHour).ToList();
        var index = groups.FindIndex(x => x.FirstHour <= now.Hour && x.LastHour >= now.Hour);
        if (index < 0)
            return null;

        PeriodSlot? Slot(CalcTimeGroup time, CalcDayGroup day)
        {
            var pair = timeDayGroups.FirstOrDefault(x => x.TimeGroupGuid == time.Guid && x.DayGroupGuid == day.Guid);
            return pair is null ? null : new PeriodSlot(time, day, pair);
        }

        var current = Slot(groups[index], today);
        if (current is null)
            return null;

        PeriodSlot? next, second;
        if (groups.Count == 1)
        {
            next = Slot(groups[0], tomorrow);
            second = Slot(groups[0], tomorrow);
        }
        else if (index == groups.Count - 1)
        {
            next = Slot(groups[0], tomorrow);
            second = Slot(groups[1], tomorrow);
        }
        else if (index == groups.Count - 2)
        {
            next = Slot(groups[index + 1], today);
            second = Slot(groups[0], tomorrow);
        }
        else
        {
            next = Slot(groups[index + 1], today);
            second = Slot(groups[index + 2], today);
        }

        return next is null || second is null ? null : new PeriodPlan(current, next, second);
    }

    /// <summary>Название периода без хвоста «(Выпечные изделия)» и переносов строк.</summary>
    public static string CleanName(string name)
    {
        var bracket = name.IndexOf('(');
        return (bracket > 0 ? name[..bracket] : name).Trim();
    }
}

/// <summary>Всё, что нужно для расчёта одной категории на одной точке.</summary>
public sealed class CalculatorSources
{
    public required DateTime Now { get; init; }
    public required int TTCode { get; init; }
    public required CalcItemsGroup Group { get; init; }
    public required PeriodPlan Periods { get; init; }
    /// <summary>Коэффициенты точки по периодам (ключ — TimeGroup).</summary>
    public required IReadOnlyDictionary<Guid, double> Coefficients { get; init; }
    /// <summary>Позиции категории в порядке показа.</summary>
    public required IReadOnlyList<CalcItem> GroupItems { get; init; }
    /// <summary>Позиции категории и позиции, по которым считаем «по аналогу».</summary>
    public required IReadOnlyDictionary<int, CalcItem> ItemsByCode { get; init; }
    public required IReadOnlyList<CalcItemOnTT> ItemsOnTT { get; init; }
    /// <summary>Действующие замены.</summary>
    public required IReadOnlyList<CalcReplacement> Replacements { get; init; }
    public required IReadOnlyList<CalcSales> Sales { get; init; }
    /// <summary>Действующие блокировки позиций категории для этой точки и для всех точек.</summary>
    public required IReadOnlyList<CalcItemBlock> Blocks { get; init; }
}

/// <summary>Строка калькулятора: средние продажи по периодам и добавки за заблокированные позиции.</summary>
public sealed class CalculatorRow
{
    public required CalcItem Item { get; init; }
    public required CalcItemOnTT OnTT { get; init; }
    /// <summary>Средние продажи до конца текущего периода (часы после текущего).</summary>
    public double AvgRest { get; set; }
    /// <summary>Средние продажи тех часов, которые уйдут на приготовление новой партии.</summary>
    public double AvgProduction { get; set; }
    public double AvgNext { get; set; }
    public double AvgSecond { get; set; }
    public double AddThis { get; set; }
    public double AddNext { get; set; }
    public double AddSecond { get; set; }
    /// <summary>Заблокированные позиции группы замен, чей спрос перешёл на эту.</summary>
    public List<string> AddFrom { get; } = [];
    public CalcItemBlock? Block { get; set; }
}

public sealed record CalculatorResult(IReadOnlyList<CalculatorRow> Rows, double ThisCoefficient, double NextCoefficient, double SecondCoefficient);

/// <summary>Расчёт строк калькулятора — перенос CalculatorController.Calculate старого портала.</summary>
public static class CalculatorEngine
{
    public static CalculatorResult Build(CalculatorSources src)
    {
        double Coefficient(PeriodSlot slot) =>
            Math.Round(src.Coefficients.TryGetValue(slot.TimeGroup.Guid, out var value) ? value : 1d, 2);

        bool Active(CalcReplacement x) => x.Begin < src.Now && x.End > src.Now;
        CalcItemOnTT? OnTT(int itemCode, int ttCode) =>
            src.ItemsOnTT.FirstOrDefault(x => x.ItemRkCode == itemCode && x.TTCode == ttCode);

        var salesByOnTT = src.Sales.ToLookup(x => x.ItemOnTTGUID);
        var ttReplacement = src.Replacements.FirstOrDefault(x => Active(x) && x.TTCode == src.TTCode);
        var hour = src.Now.Hour;
        var rows = new List<CalculatorRow>();

        foreach (var item in src.GroupItems)
        {
            var realOnTT = OnTT(item.RkCode, src.TTCode);
            // позиции нет на точке — старый портал падал, здесь просто не показываем
            if (realOnTT is null)
                continue;

            // работа по аналогу: считаем по продажам другой позиции и/или другой точки
            var calculating = item;
            var itemReplacement = src.Replacements.FirstOrDefault(x => Active(x) && x.ItemCode == item.RkCode);
            if (itemReplacement?.ReplacementItemCode is int replacementCode
                && src.ItemsByCode.TryGetValue(replacementCode, out var replacementItem))
                calculating = replacementItem;
            var salesOnTT = OnTT(calculating.RkCode, ttReplacement?.ReplacementTTCode ?? src.TTCode) ?? realOnTT;
            var sales = salesByOnTT[salesOnTT.Guid].ToList();

            var restRows = sales.Where(x => x.TimeDayGroupsGUID == src.Periods.This.TimeDayGroup.Guid && x.Hour > hour).ToList();
            var restDays = restRows.Count > 0 ? restRows[0].SettlementDays : 1;
            var nextRows = sales.Where(x => x.TimeDayGroupsGUID == src.Periods.Next.TimeDayGroup.Guid).ToList();
            var nextDays = nextRows.Count > 0 ? nextRows[0].SettlementDays : 1;
            var secondRows = sales.Where(x => x.TimeDayGroupsGUID == src.Periods.Second.TimeDayGroup.Guid).ToList();
            var secondDays = secondRows.Count > 0 ? secondRows[0].SettlementDays : 1;

            rows.Add(new CalculatorRow
            {
                Item = item,
                OnTT = realOnTT,
                AvgRest = (double)restRows.Sum(x => x.Quantity) / Math.Max(restDays, 1),
                AvgProduction = (double)restRows.Where(x => x.Hour < hour + src.Group.HourForProduction).Sum(x => x.Quantity) / Math.Max(restDays, 1),
                AvgNext = (double)nextRows.Sum(x => x.Quantity) / Math.Max(nextDays, 1),
                AvgSecond = (double)secondRows.Sum(x => x.Quantity) / Math.Max(secondDays, 1),
            });
        }

        ApplyBlocks(rows, src.Blocks);
        return new CalculatorResult(rows, Coefficient(src.Periods.This), Coefficient(src.Periods.Next), Coefficient(src.Periods.Second));
    }

    /// <summary>
    /// Спрос заблокированных позиций переходит на незаблокированные позиции той же группы замен,
    /// пропорционально их собственным продажам. Доля перехода — 1 − заблокировано / всего в группе.
    /// </summary>
    private static void ApplyBlocks(List<CalculatorRow> rows, IReadOnlyList<CalcItemBlock> blocks)
    {
        if (blocks.Count == 0)
            return;
        // при нескольких блокировках позиции главная — самая свежая
        var blockByCode = blocks
            .GroupBy(x => x.ItemRkCode)
            .ToDictionary(x => x.Key, x => x.OrderByDescending(b => b.Id).First());

        foreach (var group in rows.Where(x => x.Item.ReplacementGroupId.HasValue).GroupBy(x => x.Item.ReplacementGroupId!.Value))
        {
            var all = group.ToList();
            var blocked = all.Where(x => blockByCode.ContainsKey(x.Item.RkCode)).ToList();
            if (blocked.Count == 0)
                continue;
            var free = all.Except(blocked).ToList();
            var share = 1.0 - (double)blocked.Count / all.Count;
            var addThis = blocked.Sum(x => x.AvgRest - x.AvgProduction) * share;
            var addNext = blocked.Sum(x => x.AvgNext) * share;
            var addSecond = blocked.Sum(x => x.AvgSecond) * share;
            var freeRest = free.Sum(x => x.AvgRest);
            var freeNext = free.Sum(x => x.AvgNext);
            var freeSecond = free.Sum(x => x.AvgSecond);
            foreach (var row in free)
            {
                if (freeRest > 0)
                    row.AddThis = addThis * (row.AvgRest / freeRest);
                if (freeNext > 0)
                    row.AddNext = addNext * (row.AvgNext / freeNext);
                if (freeSecond > 0)
                    row.AddSecond = addSecond * (row.AvgSecond / freeSecond);
                if (row.AddThis + row.AddNext + row.AddSecond > 0)
                    row.AddFrom.AddRange(blocked.Select(x => x.Item.Name.Trim()));
            }
        }

        foreach (var row in rows)
            row.Block = blockByCode.GetValueOrDefault(row.Item.RkCode);
    }
}
