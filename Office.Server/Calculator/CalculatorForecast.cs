namespace Office.Server.Calculator;

/// <summary>
/// Общие числа нового расчёта. Значения по умолчанию сняты с продаж сети за сентябрь 2025 — октябрь 2026:
/// дождь от 4 мм за часы работы −5% чеков, снегопад −6,5%, жара от 27° −6%.
/// </summary>
public sealed class ForecastSettings
{
    public static readonly IReadOnlyDictionary<string, double> Defaults = new Dictionary<string, double>
    {
        ["rain_mm"] = 4,
        ["rain_effect"] = -0.05,
        ["snow_cm"] = 2,
        ["snow_effect"] = -0.065,
        ["heat_c"] = 27,
        ["heat_effect"] = -0.06,
        ["mix_heat_c"] = 25,
        ["mix_cold_c"] = -5,
        ["urgent_minutes"] = 60,
        ["latitude"] = 59.94,
        ["longitude"] = 30.31,
    };

    private readonly IReadOnlyDictionary<string, double> values;

    private ForecastSettings(IReadOnlyDictionary<string, double> values) => this.values = values;

    public static ForecastSettings From(IEnumerable<KeyValuePair<string, double>> values)
    {
        var merged = new Dictionary<string, double>(Defaults);
        foreach (var (key, value) in values)
            if (merged.ContainsKey(key))
                merged[key] = value;
        return new ForecastSettings(merged);
    }

    public static ForecastSettings Default { get; } = new(Defaults);

    public double this[string key] => values[key];
    public double RainMm => values["rain_mm"];
    public double RainEffect => values["rain_effect"];
    public double SnowCm => values["snow_cm"];
    public double SnowEffect => values["snow_effect"];
    public double HeatC => values["heat_c"];
    public double HeatEffect => values["heat_effect"];
    public double MixHeatC => values["mix_heat_c"];
    public double MixColdC => values["mix_cold_c"];
    public int UrgentMinutes => (int)values["urgent_minutes"];
    public double Latitude => values["latitude"];
    public double Longitude => values["longitude"];
}

/// <summary>Погода дня в часы работы точек (8–21).</summary>
public sealed record WeatherDay(DateTime Date, double PrecipitationMm, double SnowCm, double MaxTemperature);

/// <summary>Как погода дня меняет поток людей в точку и набор покупок категории.</summary>
public sealed record WeatherEffect(double Traffic, double Mix, IReadOnlyList<string> Notes)
{
    public static WeatherEffect None { get; } = new(1, 1, []);
    public double Factor => Traffic * Mix;

    public static WeatherEffect For(WeatherDay? day, ForecastSettings settings, double? storeRainEffect, double heatMix, double coldMix)
    {
        if (day is null)
            return None;
        double traffic = 1, mix = 1;
        var notes = new List<string>();
        if (day.SnowCm >= settings.SnowCm)
        {
            traffic *= 1 + settings.SnowEffect;
            notes.Add("снегопад");
        }
        else if (day.PrecipitationMm >= settings.RainMm)
        {
            traffic *= 1 + (storeRainEffect ?? settings.RainEffect);
            notes.Add("дождь");
        }
        if (day.MaxTemperature >= settings.HeatC)
        {
            traffic *= 1 + settings.HeatEffect;
            notes.Add("жара");
        }
        if (day.MaxTemperature >= settings.MixHeatC)
            mix *= 1 + heatMix;
        else if (day.MaxTemperature < settings.MixColdC)
        {
            mix *= 1 + coldMix;
            notes.Add("мороз");
        }
        return new WeatherEffect(traffic, mix, notes);
    }
}

/// <summary>Позиция для прогноза: средние продажи по часам и время до витрины.</summary>
public sealed class ForecastItemInput
{
    public required int RkCode { get; init; }
    public required string Name { get; init; }
    public int? ReplacementGroupId { get; init; }
    public bool Blocked { get; init; }
    /// <summary>Средние продажи за день по (группа дней, час).</summary>
    public required IReadOnlyDictionary<(Guid DayGroup, int Hour), double> Hourly { get; init; }
    /// <summary>Через сколько минут после захода новая партия на витрине.</summary>
    public required int LeadMinutes { get; init; }
    /// <summary>K1 × K2, если аудитор оставил коэффициенты; иначе 1.</summary>
    public double Coefficient { get; init; } = 1;
}

public sealed class ForecastInput
{
    public required DateTime Now { get; init; }
    /// <summary>Начало следующего окна захода; null — окон нет, считаем до конца дня.</summary>
    public required DateTime? NextStart { get; init; }
    public required Func<DateTime, Guid?> DayGroupOf { get; init; }
    /// <summary>Множитель спроса позиции на дату: календарь × погода.</summary>
    public required Func<DateTime, int, double> DayFactor { get; init; }
    /// <summary>K3 зоны суток для часа, если коэффициенты включены.</summary>
    public Func<int, double> HourCoefficient { get; init; } = _ => 1;
    /// <summary>Целевая вероятность, что товара хватит до следующей партии.</summary>
    public required double Availability { get; init; }
    public required IReadOnlyList<ForecastItemInput> Items { get; init; }
}

/// <summary>Сколько продадим до следующей партии и сколько должно лежать, чтобы хватило с заданной вероятностью.</summary>
public sealed record ForecastResult(int RkCode, double Expected, double Target, DateTime HorizonEnd, IReadOnlyList<string> AddFrom);

/// <summary>
/// Новый расчёт калькулятора. В отличие от старого:
/// горизонт — до следующего захода плюс время до витрины, а не до конца зоны суток;
/// остаток текущего часа учитывается долей; спрос поправляется календарём и погодой;
/// вместо ручной накрутки — запас под целевую вероятность наличия (продажи считаем пуассоновскими).
/// </summary>
public static class CalculatorForecast
{
    public static IReadOnlyList<ForecastResult> Build(ForecastInput input)
    {
        var z = Z(input.Availability);
        var baseEnd = input.NextStart is DateTime next && next > input.Now ? next : input.Now.Date.AddDays(1);
        var expected = new Dictionary<int, double>();
        var ends = new Dictionary<int, DateTime>();
        foreach (var item in input.Items)
        {
            var end = baseEnd.AddMinutes(Math.Max(item.LeadMinutes, 0));
            ends[item.RkCode] = end;
            double sum = 0;
            foreach (var (start, fraction) in Slots(input.Now, end))
            {
                if (input.DayGroupOf(start.Date) is not Guid dayGroup)
                    continue;
                if (!item.Hourly.TryGetValue((dayGroup, start.Hour), out var avg) || avg <= 0)
                    continue;
                sum += avg * fraction * input.DayFactor(start.Date, item.RkCode) * input.HourCoefficient(start.Hour);
            }
            expected[item.RkCode] = sum * item.Coefficient;
        }

        // спрос заблокированных уходит свободным позициям той же группы замен — как в старом расчёте
        var addFrom = input.Items.ToDictionary(x => x.RkCode, _ => new List<string>());
        foreach (var group in input.Items.Where(x => x.ReplacementGroupId.HasValue).GroupBy(x => x.ReplacementGroupId!.Value))
        {
            var all = group.ToList();
            var blocked = all.Where(x => x.Blocked).ToList();
            var free = all.Where(x => !x.Blocked).ToList();
            if (blocked.Count == 0 || free.Count == 0)
                continue;
            var share = 1.0 - (double)blocked.Count / all.Count;
            var moved = blocked.Sum(x => expected[x.RkCode]) * share;
            var freeSum = free.Sum(x => expected[x.RkCode]);
            if (moved <= 0 || freeSum <= 0)
                continue;
            foreach (var item in free)
            {
                expected[item.RkCode] += moved * expected[item.RkCode] / freeSum;
                addFrom[item.RkCode].AddRange(blocked.Select(x => x.Name));
            }
        }

        return input.Items.Select(item =>
        {
            var e = expected[item.RkCode];
            var target = e > 0 ? e + z * Math.Sqrt(e) : 0;
            return new ForecastResult(item.RkCode, Math.Round(e, 2), Math.Round(target, 2), ends[item.RkCode], addFrom[item.RkCode]);
        }).ToList();
    }

    /// <summary>Часы между двумя моментами: начало часа и какая его доля попадает в отрезок.</summary>
    public static IEnumerable<(DateTime Start, double Fraction)> Slots(DateTime from, DateTime to)
    {
        var hour = new DateTime(from.Year, from.Month, from.Day, from.Hour, 0, 0);
        while (hour < to)
        {
            var next = hour.AddHours(1);
            var a = from > hour ? from : hour;
            var b = to < next ? to : next;
            if (b > a)
                yield return (hour, (b - a).TotalMinutes / 60.0);
            hour = next;
        }
    }

    /// <summary>Квантиль нормального распределения (Acklam): во сколько «сигм» запас для такой вероятности.</summary>
    public static double Z(double probability)
    {
        var p = Math.Clamp(probability, 0.5, 0.995);
        double[] a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
        double[] b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
        double[] c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
        double[] d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
        if (p <= 1 - 0.02425)
        {
            var q = p - 0.5;
            var r = q * q;
            return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q
                / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
        }
        var t = Math.Sqrt(-2 * Math.Log(1 - p));
        return -(((((c[0] * t + c[1]) * t + c[2]) * t + c[3]) * t + c[4]) * t + c[5])
            / ((((d[0] * t + d[1]) * t + d[2]) * t + d[3]) * t + 1);
    }
}
