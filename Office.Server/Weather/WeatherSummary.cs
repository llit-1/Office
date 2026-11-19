using System.Globalization;

namespace Office.Server.Weather;

public sealed record WeatherPartDto(string Name, int Temperature, int Code, string Description);

public sealed record WeatherNowDto(
    int Temperature,
    int Code,
    string Description,
    string Place,
    string UpdatedAt,
    IReadOnlyList<WeatherPartDto> Parts,
    string? Precipitation);

/// <summary>
/// Почасовой прогноз → то, что видно в шапке: погода в текущий час и четыре части дня
/// (утро 6–12, день 12–18, вечер 18–24 и ночь 0–6) плюс одна строка про осадки. Ночь — та, что идёт сейчас,
/// если сейчас от 0 до 6, иначе ближайшая следующая.
/// </summary>
public static class WeatherSummary
{
    private static readonly CultureInfo Ru = CultureInfo.GetCultureInfo("ru-RU");

    // snow counts from a tenth of a centimetre, rain from a tenth of a millimetre: less is a trace, not worth a line
    private const double Trace = 0.1;

    private sealed record Part(string Name, string When, bool IsNight, int FromHour, int ToHour);

    private static readonly Part[] Parts =
    [
        new("Утро", "утром", false, 6, 12),
        new("День", "днём", false, 12, 18),
        new("Вечер", "вечером", false, 18, 24),
        new("Ночь", "ночью", true, 0, 6),
    ];

    /// <summary>null — в прогнозе нет текущего часа (прогноз устарел или пуст).</summary>
    public static WeatherNowDto? Build(WeatherForecast forecast, DateTime now, string place)
    {
        var hour = now.Date.AddHours(now.Hour);
        var current = forecast.Hours.FirstOrDefault(x => x.Time == hour);
        if (current is null)
            return null;

        var parts = new List<WeatherPartDto>();
        var snow = new List<(string When, double Amount)>();
        var rain = new List<(string When, double Amount)>();
        var drizzle = new List<(string When, double Amount)>();
        foreach (var part in Parts)
        {
            var day = part.IsNight && now.Hour >= 6 ? now.Date.AddDays(1) : now.Date;
            var from = day.AddHours(part.FromHour);
            var to = day.AddHours(part.ToHour);
            var hours = forecast.Hours.Where(x => x.Time >= from && x.Time < to).ToList();
            if (hours.Count == 0)
                continue;

            // precipitation beats clouds: the icon warns about the worst of the part, and WMO codes grow with it
            var code = hours.Max(x => x.Code);
            parts.Add(new WeatherPartDto(part.Name, Round(hours.Average(x => x.Temperature)), code, PortalWeather.Describe(code)));

            var snowfall = hours.Sum(x => x.Snowfall);
            var precipitation = hours.Sum(x => x.Precipitation);
            if (snowfall >= Trace)
                snow.Add((part.When, snowfall));
            else if (precipitation >= Trace)
                // the words follow the tile icon: drizzle codes 51–57 are «морось», not «дождь»
                (code is >= 51 and <= 57 ? drizzle : rain).Add((part.When, precipitation));
        }

        var lines = new List<string>();
        if (snow.Count > 0)
            lines.Add($"Снег {Join(snow.Select(x => x.When))}, до {Amount(snow.Sum(x => x.Amount))} см");
        if (rain.Count > 0)
            lines.Add($"Дождь {Join(rain.Select(x => x.When))}, до {Amount(rain.Sum(x => x.Amount))} мм");
        if (drizzle.Count > 0)
            lines.Add($"Морось {Join(drizzle.Select(x => x.When))}, до {Amount(drizzle.Sum(x => x.Amount))} мм");

        return new WeatherNowDto(
            Round(current.Temperature),
            current.Code,
            PortalWeather.Describe(current.Code),
            place,
            forecast.FetchedAt.ToString("HH:mm", Ru),
            parts,
            lines.Count == 0 ? null : string.Join("; ", lines));
    }

    private static int Round(double value) => (int)Math.Round(value, MidpointRounding.AwayFromZero);

    private static string Amount(double value) =>
        value < 1 ? Math.Round(value, 1).ToString("0.#", Ru) : Math.Round(value).ToString("0", Ru);

    private static string Join(IEnumerable<string> items)
    {
        var list = items.ToList();
        return list.Count == 1 ? list[0] : $"{string.Join(", ", list.Take(list.Count - 1))} и {list[^1]}";
    }
}
