using System.Globalization;
using System.Text.Json;
using Microsoft.Extensions.Caching.Memory;

namespace Office.Server.Weather;

/// <summary>Час прогноза: температура, код погоды WMO, осадки (мм) и снег (см).</summary>
public sealed record WeatherHour(DateTime Time, double Temperature, int Code, double Precipitation, double Snowfall);

/// <summary>Почасовой прогноз на сегодня и завтра и время, когда он получен.</summary>
public sealed record WeatherForecast(DateTime FetchedAt, IReadOnlyList<WeatherHour> Hours);

/// <summary>
/// Почасовой прогноз Open-Meteo для шапки портала. Наружу уходят только координаты, без данных сотрудников;
/// браузеры к Open-Meteo не ходят. Прогноз на день кешируется на 2 часа по координатам, неудача — на 5 минут,
/// чтобы недоступный сервис не тормозил каждую страницу. Выключается настройкой Weather:Enabled = false.
/// </summary>
public class PortalWeather(IHttpClientFactory httpClientFactory, IMemoryCache cache, IConfiguration configuration, ILogger<PortalWeather> logger)
{
    public const string HttpClientName = "PortalWeather";
    private const string DefaultUrl = "https://api.open-meteo.com/v1/forecast";

    /// <summary>Прогноз по координатам; null — погоды нет (выключена или сервис не ответил).</summary>
    public virtual async Task<WeatherForecast?> GetAsync(double latitude, double longitude, CancellationToken ct)
    {
        if (!configuration.GetValue("Weather:Enabled", true))
            return null;

        var key = FormattableString.Invariant($"portal-weather:{latitude:0.00}:{longitude:0.00}");
        if (cache.TryGetValue(key, out WeatherForecast? cached))
            return cached;

        WeatherForecast? result;
        try
        {
            var url = (configuration["Weather:Url"] ?? DefaultUrl)
                + FormattableString.Invariant($"?latitude={latitude}&longitude={longitude}&hourly=temperature_2m,weather_code,precipitation,snowfall&timezone=Europe%2FMoscow&forecast_days=2");
            var client = httpClientFactory.CreateClient(HttpClientName);
            using var response = await client.GetAsync(url, ct);
            response.EnsureSuccessStatusCode();
            result = new WeatherForecast(DateTime.Now, Parse(await response.Content.ReadAsStringAsync(ct)));
            cache.Set(key, result, TimeSpan.FromHours(2));
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or JsonException or KeyNotFoundException
                                       or FormatException or InvalidOperationException && !ct.IsCancellationRequested)
        {
            logger.LogWarning(ex, "Portal weather is unavailable.");
            result = null;
            cache.Set(key, result, TimeSpan.FromMinutes(5));
        }

        return result;
    }

    /// <summary>Почасовой ответ Open-Meteo → часы прогноза; часы без температуры пропускаются.</summary>
    public static IReadOnlyList<WeatherHour> Parse(string json)
    {
        using var doc = JsonDocument.Parse(json);
        var hourly = doc.RootElement.GetProperty("hourly");
        var times = hourly.GetProperty("time").EnumerateArray()
            .Select(x => DateTime.ParseExact(x.GetString()!, "yyyy-MM-dd'T'HH:mm", CultureInfo.InvariantCulture))
            .ToList();

        double At(string name, int i)
        {
            var value = hourly.GetProperty(name)[i];
            return value.ValueKind == JsonValueKind.Number ? value.GetDouble() : double.NaN;
        }

        var hours = new List<WeatherHour>();
        for (var i = 0; i < times.Count; i++)
        {
            var temperature = At("temperature_2m", i);
            if (double.IsNaN(temperature))
                continue;
            var code = At("weather_code", i);
            var precipitation = At("precipitation", i);
            var snowfall = At("snowfall", i);
            hours.Add(new WeatherHour(
                times[i],
                temperature,
                double.IsNaN(code) ? 0 : (int)code,
                double.IsNaN(precipitation) ? 0 : precipitation,
                double.IsNaN(snowfall) ? 0 : snowfall));
        }

        return hours;
    }

    /// <summary>Код погоды WMO, которым отвечает Open-Meteo, → короткое описание.</summary>
    public static string Describe(int code) => code switch
    {
        0 => "ясно",
        1 => "малооблачно",
        2 => "переменная облачность",
        3 => "пасмурно",
        45 or 48 => "туман",
        >= 51 and <= 57 => "морось",
        >= 61 and <= 67 => "дождь",
        >= 71 and <= 77 => "снег",
        >= 80 and <= 82 => "ливень",
        85 or 86 => "снегопад",
        >= 95 and <= 99 => "гроза",
        _ => "без осадков",
    };
}
