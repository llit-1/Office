using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.Weather;

namespace Office.Server.Controllers;

/// <summary>
/// Погода для шапки портала из RKNET.WeatherStatistics (парсер Яндекса кладёт туда среднюю за день по городу):
/// сегодня и неделя вперёд. Интернет серверу не нужен. Доступна любому вошедшему пользователю.
/// </summary>
[Route("api/[controller]")]
[ApiController]
public class WeatherController(RKNETDBContext db, IMemoryCache cache, IConfiguration configuration) : ControllerBase
{
    private const string DefaultPlace = "Санкт-Петербург";
    private const string CacheKey = "portal-weather-week";
    // the parser writes a few times a day at most; every page open does not need its own query
    private static readonly TimeSpan CacheLifetime = TimeSpan.FromMinutes(30);

    [HttpGet]
    public async Task<ActionResult<WeatherWeekDto>> Get(CancellationToken cancellationToken)
    {
        var today = Today();
        var key = $"{CacheKey}:{today:yyyy-MM-dd}";
        if (!cache.TryGetValue(key, out WeatherWeekDto? week))
        {
            var rows = await db.WeatherStatistics.AsNoTracking()
                .Where(row => row.Date >= today && row.Date < today.AddDays(WeatherWeek.Days))
                .ToListAsync(cancellationToken);
            week = WeatherWeek.Build(rows, today, configuration["Weather:Place"] ?? DefaultPlace);
            cache.Set(key, week, CacheLifetime);
        }

        return week is null ? NoContent() : week;
    }

    /// <summary>Сегодня по времени сервера (Москва) — так же, как пишет даты парсер.</summary>
    protected virtual DateTime Today() => DateTime.Today;
}
