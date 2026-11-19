using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.Weather;

namespace Office.Server.Controllers;

/// <summary>
/// Погода для шапки портала. Где находится человек, портал не знает, поэтому: у учётки с одной точкой
/// (обычно учётка ТТ) — погода у этой точки, у всех остальных — в городе из настроек (по умолчанию Санкт-Петербург).
/// Доступна любому вошедшему пользователю.
/// </summary>
[Route("api/[controller]")]
[ApiController]
public class WeatherController(RKNETDBContext db, PortalWeather weather, IConfiguration configuration) : ControllerBase
{
    private const double DefaultLatitude = 59.94;
    private const double DefaultLongitude = 30.31;
    private const string DefaultPlace = "Санкт-Петербург";

    [HttpGet]
    public async Task<ActionResult<WeatherNowDto>> Get(CancellationToken cancellationToken)
    {
        var (latitude, longitude, place) = await ResolvePlaceAsync(cancellationToken);
        var forecast = await weather.GetAsync(latitude, longitude, cancellationToken);
        // Moscow server time, the same zone the forecast is asked in
        var summary = forecast is null ? null : WeatherSummary.Build(forecast, Now(), place);
        return summary is null ? NoContent() : summary;
    }

    protected virtual DateTime Now() => DateTime.Now;

    private async Task<(double Latitude, double Longitude, string Place)> ResolvePlaceAsync(CancellationToken cancellationToken)
    {
        if (int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var userId))
        {
            var points = await db.OfficeUser.AsNoTracking()
                .Where(user => user.Id == userId && user.DefaultLocations != 1)
                .SelectMany(user => user.Locations)
                .Where(location => location.Actual == 1 && location.Latitude != null && location.Longitude != null)
                .Select(location => new { location.Latitude, location.Longitude, Name = location.AltName ?? location.Name })
                .Take(2)
                .ToListAsync(cancellationToken);

            // one point: that is where the person works; several points or «все ТТ» — the city
            if (points.Count == 1)
                return (Math.Round(points[0].Latitude!.Value, 2), Math.Round(points[0].Longitude!.Value, 2), points[0].Name);
        }

        return (
            configuration.GetValue("Weather:Latitude", DefaultLatitude),
            configuration.GetValue("Weather:Longitude", DefaultLongitude),
            configuration["Weather:Place"] ?? DefaultPlace);
    }
}

