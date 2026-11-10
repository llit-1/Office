using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace Office.Server.Calculator;

/// <summary>Прогноз погоды по дням; пустой словарь — прогноза нет, расчёт идёт без погоды.</summary>
public interface IWeatherForecast
{
    Task<IReadOnlyDictionary<DateTime, WeatherDay>> GetAsync(double latitude, double longitude, CancellationToken ct);
}

/// <summary>
/// Прогноз Open-Meteo (бесплатный, без ключа) на три дня, по часам сведённый к часам работы точек 8–21.
/// Ответ кешируется на час, неудача — на 10 минут, чтобы не ждать сервис на каждом открытии калькулятора.
/// Выключается настройкой Calculator:Weather:Enabled = false.
/// </summary>
public sealed class OpenMeteoWeather(IHttpClientFactory httpClientFactory, IMemoryCache cache, IConfiguration configuration, ILogger<OpenMeteoWeather> logger)
    : IWeatherForecast
{
    public const string HttpClientName = "CalculatorWeather";
    private const string DefaultUrl = "https://api.open-meteo.com/v1/forecast";

    public async Task<IReadOnlyDictionary<DateTime, WeatherDay>> GetAsync(double latitude, double longitude, CancellationToken ct)
    {
        if (!configuration.GetValue("Calculator:Weather:Enabled", true))
            return new Dictionary<DateTime, WeatherDay>();
        var key = FormattableString.Invariant($"calculator-weather:{latitude:0.00}:{longitude:0.00}");
        if (cache.TryGetValue(key, out IReadOnlyDictionary<DateTime, WeatherDay>? cached) && cached is not null)
            return cached;

        IReadOnlyDictionary<DateTime, WeatherDay> result;
        try
        {
            var url = (configuration["Calculator:Weather:Url"] ?? DefaultUrl)
                + FormattableString.Invariant($"?latitude={latitude}&longitude={longitude}&hourly=temperature_2m,precipitation,snowfall&timezone=Europe%2FMoscow&forecast_days=3");
            var client = httpClientFactory.CreateClient(HttpClientName);
            using var response = await client.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();
            result = Parse(await response.Content.ReadAsStringAsync(ct));
            cache.Set(key, result, TimeSpan.FromHours(1));
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or FormatException
                                       or KeyNotFoundException or InvalidOperationException && !ct.IsCancellationRequested)
        {
            logger.LogWarning(ex, "Calculator weather forecast is unavailable.");
            result = new Dictionary<DateTime, WeatherDay>();
            cache.Set(key, result, TimeSpan.FromMinutes(10));
        }
        return result;
    }

    /// <summary>Часовой ответ Open-Meteo → день: осадки и снег за 8–21, максимум температуры за 8–21.</summary>
    public static IReadOnlyDictionary<DateTime, WeatherDay> Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var hourly = doc.RootElement.GetProperty("hourly");
        var times = hourly.GetProperty("time").EnumerateArray().Select(x => DateTime.Parse(x.GetString()!, CultureInfo.InvariantCulture)).ToList();
        double At(string name, int i)
        {
            var value = hourly.GetProperty(name)[i];
            return value.ValueKind == JsonValueKind.Number ? value.GetDouble() : double.NaN;
        }

        var days = new Dictionary<DateTime, WeatherDay>();
        foreach (var day in times.Select((t, i) => (t, i)).Where(x => x.t.Hour is >= 8 and < 21).GroupBy(x => x.t.Date))
        {
            var temps = day.Select(x => At("temperature_2m", x.i)).Where(x => !double.IsNaN(x)).ToList();
            if (temps.Count == 0)
                continue;
            var rain = day.Select(x => At("precipitation", x.i)).Where(x => !double.IsNaN(x)).Sum();
            var snow = day.Select(x => At("snowfall", x.i)).Where(x => !double.IsNaN(x)).Sum();
            days[day.Key] = new WeatherDay(day.Key, Math.Round(rain, 1), Math.Round(snow, 1), temps.Max());
        }
        return days;
    }
}
