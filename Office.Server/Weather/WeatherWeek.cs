using System.Globalization;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Weather;

public sealed record WeatherDayDto(DateTime Date, string Name, int Temperature, int Code, string Description, double Rain);

public sealed record WeatherWeekDto(int Temperature, int Code, string Description, string Place, IReadOnlyList<WeatherDayDto> Days);

/// <summary>
/// Дневная погода из WeatherStatistics → то, что видно в шапке: сегодня и следующие дни.
/// Иконка задаётся кодом WMO, как у сервисов погоды, чтобы клиенту было всё равно, откуда данные.
/// </summary>
public static class WeatherWeek
{
    public const int Days = 7;

    private static readonly CultureInfo Ru = CultureInfo.GetCultureInfo("ru-RU");

    // a tenth of a millimetre is a trace, half a millimetre is already proper rain or snow
    private const double Trace = 0.1;
    private const double Proper = 0.5;

    /// <summary>null — в таблице нет сегодняшнего дня (парсер не отработал).</summary>
    public static WeatherWeekDto? Build(IReadOnlyList<WeatherStatistic> rows, DateTime today, string place)
    {
        var days = rows
            .Where(row => row.Date.Date >= today.Date && row.Temperature is not null)
            .OrderBy(row => row.Date)
            .Take(Days)
            .Select(row =>
            {
                var code = Code(row.Temperature!.Value, row.Rain ?? 0, row.Cloudiness);
                return new WeatherDayDto(
                    row.Date.Date,
                    Name(row.Date.Date, today.Date),
                    Round(row.Temperature.Value),
                    code,
                    Describe(code),
                    Math.Round(row.Rain ?? 0, 1));
            })
            .ToList();

        if (days.Count == 0 || days[0].Date != today.Date)
            return null;

        return new WeatherWeekDto(days[0].Temperature, days[0].Code, days[0].Description, place, days);
    }

    /// <summary>Осадки важнее облаков: дождь при плюсе, снег при нуле и ниже; иначе облачность в октах.</summary>
    public static int Code(double temperature, double rain, int? cloudiness)
    {
        var snow = temperature <= 0;
        if (rain >= Proper)
            return snow ? 73 : 63;
        if (rain >= Trace)
            return snow ? 71 : 53;
        return cloudiness switch
        {
            null or >= 6 => 3,
            >= 3 => 2,
            _ => 0,
        };
    }

    public static string Describe(int code) => code switch
    {
        0 => "ясно",
        2 => "переменная облачность",
        3 => "пасмурно",
        53 => "морось",
        63 => "дождь",
        71 => "небольшой снег",
        73 => "снег",
        _ => "без осадков",
    };

    private static string Name(DateTime date, DateTime today)
    {
        if (date == today) return "Сегодня";
        if (date == today.AddDays(1)) return "Завтра";
        var weekday = Ru.DateTimeFormat.GetAbbreviatedDayName(date.DayOfWeek);
        return $"{char.ToUpper(weekday[0], Ru)}{weekday[1..]} {date.Day}";
    }

    private static int Round(double value) => (int)Math.Round(value, MidpointRounding.AwayFromZero);
}
