using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.Calculator;

namespace Office.Server.Calculator;

/// <summary>Множители дня для аудитора: что поправило прогноз и почему.</summary>
public sealed record ForecastDayNote(DateTime Date, double Calendar, double Weather, IReadOnlyList<string> Reasons);

public sealed record ForecastSheet(
    DateTime? NextStart,
    double Availability,
    bool UseCoefficients,
    IReadOnlyDictionary<int, ForecastResult> Items,
    IReadOnlyList<ForecastDayNote> Days,
    bool WeatherKnown);

/// <summary>
/// Новый расчёт: продажи по часам из CALCULATOR, настройки, календарь и срочные заходы из <see cref="CalculatorPlanningStore"/>
/// (пока в памяти сервера), погода; сам расчёт — <see cref="CalculatorForecast"/>.
/// </summary>
public sealed class CalculatorForecastService(CalculatorDbContext calc, CalculatorPlanningStore planning, IWeatherForecast weather)
{
    private static readonly CultureInfo Ru = CultureInfo.GetCultureInfo("ru-RU");

    public bool Enabled(int tt) => planning.Store(tt)?.Forecast == true;

    public ForecastSettings Settings() => planning.Settings();

    /// <summary>Действующие срочные заходы точки: начаты не раньше чем «длина захода» назад, свежие первыми.</summary>
    public List<UrgentVisit> ActiveUrgent(int tt, DateTime now)
    {
        var since = now.AddMinutes(-Settings().UrgentMinutes);
        return planning.Urgent().Where(x => x.TTCode == tt && x.StartedAt > since && x.StartedAt <= now).OrderByDescending(x => x.StartedAt).ToList();
    }

    /// <summary>Срочный заход категории: действующий, если уже идёт, иначе новый.</summary>
    public UrgentVisit StartUrgent(int tt, string category, DateTime now, string reason, int userId, string userName) =>
        planning.StartUrgent(tt, category, now, reason, userId, userName, Settings().UrgentMinutes);

    public async Task<ForecastSheet?> BuildAsync(CalculatorCategories.Category category, int tt, DateTime now, DateTime? nextStart, CancellationToken ct = default)
    {
        var group = await calc.ItemsGroups.AsNoTracking().FirstOrDefaultAsync(x => x.Guid == category.Group, ct);
        if (group is null)
            return null;
        var settings = Settings();
        var categorySettings = planning.Category(category.Slug);
        var store = planning.Store(tt);

        var groupItems = await calc.Items.AsNoTracking().Where(x => x.ItemsGroup == group.Guid)
            .OrderBy(x => x.Sequence).ThenBy(x => x.RkCode).ToListAsync(ct);
        var groupCodes = groupItems.Select(x => x.RkCode).ToList();
        var itemSettings = planning.Items();

        // работа по аналогу — как в старом расчёте: продажи другой позиции и/или другой точки
        var replacements = await calc.Replacements.AsNoTracking()
            .Where(x => x.Begin < now && x.End > now && ((x.ItemCode != null && groupCodes.Contains(x.ItemCode.Value)) || x.TTCode == tt))
            .ToListAsync(ct);
        var ttReplacement = replacements.FirstOrDefault(x => x.TTCode == tt)?.ReplacementTTCode;
        var salesTt = ttReplacement ?? tt;
        int SalesCode(int code) => replacements.FirstOrDefault(x => x.ItemCode == code)?.ReplacementItemCode ?? code;
        var allCodes = groupCodes.Concat(groupCodes.Select(SalesCode)).Distinct().ToList();
        var onTT = await calc.ItemOnTT.AsNoTracking()
            .Where(x => (x.TTCode == tt || x.TTCode == salesTt) && allCodes.Contains(x.ItemRkCode))
            .ToListAsync(ct);

        var dayGroups = await calc.DayGroups.AsNoTracking().ToListAsync(ct);
        var timeGroups = await calc.TimeGroups.AsNoTracking().Where(x => x.ItemsGroup == group.Guid).ToListAsync(ct);
        var timeGroupIds = timeGroups.Select(x => x.Guid).ToList();
        var pairs = await calc.TimeDayGroups.AsNoTracking().Where(x => timeGroupIds.Contains(x.TimeGroupGuid)).ToDictionaryAsync(x => x.Guid, ct);
        var onTTGuids = onTT.Select(x => x.Guid).ToList();
        var sales = await calc.Sales.AsNoTracking().Where(x => onTTGuids.Contains(x.ItemOnTTGUID)).ToListAsync(ct);
        var hourly = sales
            .Where(x => pairs.ContainsKey(x.TimeDayGroupsGUID))
            .GroupBy(x => (x.ItemOnTTGUID, pairs[x.TimeDayGroupsGUID].DayGroupGuid))
            .SelectMany(g =>
            {
                var days = Math.Max(g.Max(x => x.SettlementDays), 1);
                return g.GroupBy(x => x.Hour).Select(h => (g.Key.ItemOnTTGUID, g.Key.DayGroupGuid, Hour: h.Key, Avg: (double)h.Sum(x => x.Quantity) / days));
            })
            .GroupBy(x => x.ItemOnTTGUID)
            .ToDictionary(g => g.Key, g => (IReadOnlyDictionary<(Guid, int), double>)g.ToDictionary(x => (x.DayGroupGuid, x.Hour), x => x.Avg));

        var blocked = (await calc.ItemBlocks.AsNoTracking()
            .Where(x => x.Enable && x.Begin <= now && x.End >= now && (x.TTCode == null || x.TTCode == tt) && groupCodes.Contains(x.ItemRkCode))
            .Select(x => x.ItemRkCode)
            .ToListAsync(ct)).ToHashSet();

        var k3 = categorySettings.UseCoefficients
            ? await calc.PeriodCoefficients.AsNoTracking().Where(x => x.TTCode == tt && timeGroupIds.Contains(x.TimeGroupGuid))
                .ToDictionaryAsync(x => x.TimeGroupGuid, x => Math.Round(x.Coefficient, 2), ct)
            : new Dictionary<Guid, double>();
        double HourCoefficient(int hour)
        {
            var timeGroup = timeGroups.FirstOrDefault(x => x.FirstHour <= hour && x.LastHour >= hour);
            return timeGroup is not null && k3.TryGetValue(timeGroup.Guid, out var value) ? value : 1;
        }

        int Lead(int code) => itemSettings.TryGetValue(code, out var own) && own.LeadMinutes is int minutes ? minutes : categorySettings.LeadMinutes;
        var inputs = new List<ForecastItemInput>();
        foreach (var item in groupItems)
        {
            var real = onTT.FirstOrDefault(x => x.ItemRkCode == item.RkCode && x.TTCode == tt);
            if (real is null)
                continue;
            var source = onTT.FirstOrDefault(x => x.ItemRkCode == SalesCode(item.RkCode) && x.TTCode == salesTt) ?? real;
            inputs.Add(new ForecastItemInput
            {
                RkCode = item.RkCode,
                Name = item.Name.Trim(),
                ReplacementGroupId = item.ReplacementGroupId,
                Blocked = blocked.Contains(item.RkCode),
                Hourly = hourly.GetValueOrDefault(source.Guid) ?? new Dictionary<(Guid, int), double>(),
                LeadMinutes = Lead(item.RkCode),
                Coefficient = categorySettings.UseCoefficients ? item.Coefficient * real.Coefficient : 1,
            });
        }

        // календарь и погода на дни горизонта
        var lastDay = ((nextStart is DateTime next && next > now ? next : now.Date.AddDays(1))
            .AddMinutes(inputs.Count == 0 ? 0 : inputs.Max(x => x.LeadMinutes))).Date;
        var modifiers = planning.Modifiers()
            .Where(x => x.DateFrom <= lastDay && x.DateTo >= now.Date
                && (x.TTCode == null || x.TTCode == tt)
                && (x.Category == null || x.Category == category.Slug))
            .ToList();
        var forecastDays = await weather.GetAsync(settings.Latitude, settings.Longitude, ct);
        var weatherByDay = new Dictionary<DateTime, WeatherEffect>();
        var notes = new List<ForecastDayNote>();
        for (var day = now.Date; day <= lastDay; day = day.AddDays(1))
        {
            var effect = WeatherEffect.For(forecastDays.GetValueOrDefault(day), settings, store?.RainEffect, categorySettings.HeatEffect, categorySettings.ColdEffect);
            weatherByDay[day] = effect;
            var dayModifiers = modifiers.Where(x => x.RkCode == null && x.DateFrom <= day && x.DateTo >= day).ToList();
            var calendar = dayModifiers.Aggregate(1.0, (acc, x) => acc * x.Factor);
            var reasons = dayModifiers.Select(x => x.Title).Concat(effect.Notes).ToList();
            if (Math.Abs(calendar - 1) > 0.001 || Math.Abs(effect.Factor - 1) > 0.001 || reasons.Count > 0)
                notes.Add(new ForecastDayNote(day, Math.Round(calendar, 3), Math.Round(effect.Factor, 3), reasons));
        }
        double DayFactor(DateTime date, int code) =>
            modifiers.Where(x => (x.RkCode == null || x.RkCode == code) && x.DateFrom <= date && x.DateTo >= date)
                .Aggregate(1.0, (acc, x) => acc * x.Factor)
            * (weatherByDay.TryGetValue(date, out var effect) ? effect.Factor : 1);

        Guid? DayGroupOf(DateTime date)
        {
            var dow = (int)date.DayOfWeek;
            return dayGroups.FirstOrDefault(x => x.FirstDayUS <= dow && x.LastDayUS >= dow)?.Guid;
        }

        var results = CalculatorForecast.Build(new ForecastInput
        {
            Now = now,
            NextStart = nextStart,
            DayGroupOf = DayGroupOf,
            DayFactor = DayFactor,
            HourCoefficient = HourCoefficient,
            Availability = categorySettings.Availability,
            Items = inputs,
        });
        return new ForecastSheet(nextStart, categorySettings.Availability, categorySettings.UseCoefficients,
            results.ToDictionary(x => x.RkCode), notes, forecastDays.Count > 0);
    }

    /// <summary>«чт 23.10: День народного единства ×0,82, дождь ×0,95».</summary>
    public static string Describe(ForecastDayNote day)
    {
        var parts = new List<string>();
        if (Math.Abs(day.Calendar - 1) > 0.001)
            parts.Add($"календарь ×{day.Calendar.ToString("0.##", Ru)}");
        if (Math.Abs(day.Weather - 1) > 0.001)
            parts.Add($"погода ×{day.Weather.ToString("0.##", Ru)}");
        var why = day.Reasons.Count > 0 ? $" ({string.Join(", ", day.Reasons)})" : "";
        return $"{day.Date.ToString("ddd dd.MM", Ru)}: {string.Join(", ", parts)}{why}";
    }
}
