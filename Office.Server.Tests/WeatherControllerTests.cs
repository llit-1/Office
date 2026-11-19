using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Weather;
using Xunit;

namespace Office.Server.Tests;

public class WeatherControllerTests
{
    private static readonly DateTime Today = DateTime.Today;
    private static readonly DateTime Afternoon = Today.AddHours(15).AddMinutes(20);

    private sealed class UnusedHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => throw new InvalidOperationException("Open-Meteo не вызывается в тесте.");
    }

    /// <summary>Open-Meteo подменён: запоминает координаты, отвечает заданным прогнозом.</summary>
    private sealed class FakeWeather(WeatherForecast? answer) : PortalWeather(
        new UnusedHttpClientFactory(), new MemoryCache(new MemoryCacheOptions()), new ConfigurationBuilder().Build(), NullLogger<PortalWeather>.Instance)
    {
        public (double Latitude, double Longitude)? Asked { get; private set; }

        public override Task<WeatherForecast?> GetAsync(double latitude, double longitude, CancellationToken ct)
        {
            Asked = (latitude, longitude);
            return Task.FromResult(answer);
        }
    }

    private sealed class Controller(RKNETDBContext db, PortalWeather weather) : WeatherController(db, weather, new ConfigurationBuilder().Build())
    {
        protected override DateTime Now() => Afternoon;
    }

    /// <summary>Сутки и ещё 6 часов: облачно −4…−2, снег вечером с 18 до 20, ночью ясно −7.</summary>
    private static WeatherForecast Forecast()
    {
        var hours = new List<WeatherHour>();
        for (var h = 0; h < 30; h++)
        {
            var time = Today.AddHours(h);
            hours.Add(h switch
            {
                >= 18 and < 21 => new WeatherHour(time, -3, 73, 1, 0.7),
                >= 24 => new WeatherHour(time, -7, 0, 0, 0),
                _ => new WeatherHour(time, h is >= 12 and < 18 ? -2.5 : -4, 3, 0, 0),
            });
        }
        return new WeatherForecast(Today.AddHours(14).AddMinutes(5), hours);
    }

    private static (Controller Controller, FakeWeather Weather) Create(Action<RKNETDBContext> seed, int userId, bool weatherAvailable = true)
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        seed(db);
        db.SaveChanges();
        var weather = new FakeWeather(weatherAvailable ? Forecast() : null);
        var controller = new Controller(db, weather)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString())], "Test")),
                },
            },
        };
        return (controller, weather);
    }

    private static Location Point(string name, double latitude, double longitude) =>
        new() { Guid = Guid.NewGuid(), Name = name, Actual = 1, Latitude = latitude, Longitude = longitude };

    [Fact]
    public void ParsesTheHourlyBlockOfOpenMeteo()
    {
        // shape of the real answer for Saint Petersburg, 2026-11-19, two hours kept
        const string json = """
            {"latitude":59.94,"hourly":{"time":["2026-11-19T14:00","2026-11-19T15:00"],
             "temperature_2m":[2.5,null],"weather_code":[3,73],"precipitation":[0.0,0.4],"snowfall":[0.0,0.28]}}
            """;

        Assert.Equal([new WeatherHour(new DateTime(2026, 11, 19, 14, 0, 0), 2.5, 3, 0, 0)], PortalWeather.Parse(json));
    }

    [Theory]
    [InlineData(0, "ясно")]
    [InlineData(45, "туман")]
    [InlineData(63, "дождь")]
    [InlineData(73, "снег")]
    [InlineData(86, "снегопад")]
    [InlineData(95, "гроза")]
    public void DescribesWeatherCodes(int code, string text) => Assert.Equal(text, PortalWeather.Describe(code));

    [Fact]
    public void SummarisesTheDayIntoFourParts()
    {
        var summary = WeatherSummary.Build(Forecast(), Afternoon, "Санкт-Петербург")!;

        Assert.Equal((-3, 3, "пасмурно", "14:05"), (summary.Temperature, summary.Code, summary.Description, summary.UpdatedAt));
        Assert.Equal(
            [
                new WeatherPartDto("Утро", -4, 3, "пасмурно"),
                new WeatherPartDto("День", -3, 3, "пасмурно"),
                new WeatherPartDto("Вечер", -4, 73, "снег"), // snow wins over clouds for the icon
                new WeatherPartDto("Ночь", -7, 0, "ясно"),
            ],
            summary.Parts);
        Assert.Equal("Снег вечером, до 2 см", summary.Precipitation);
    }

    [Fact]
    public void ListsRainAndSnowByPartsOfTheDay()
    {
        var hours = Forecast().Hours
            .Select(h => h.Time.Hour is 7 or 13 ? h with { Code = 61, Precipitation = 0.3 } : h)
            .ToList();

        var summary = WeatherSummary.Build(new WeatherForecast(Today, hours), Afternoon, "x")!;

        Assert.Equal("Снег вечером, до 2 см; Дождь утром и днём, до 0,6 мм", summary.Precipitation);
    }

    [Fact]
    public void CallsDrizzleByItsName()
    {
        var hours = Forecast().Hours
            .Select(h => h.Time.Hour == 8 ? h with { Code = 53, Precipitation = 0.3 } : h)
            .ToList();

        var summary = WeatherSummary.Build(new WeatherForecast(Today, hours), Afternoon, "x")!;

        Assert.Equal("Снег вечером, до 2 см; Морось утром, до 0,3 мм", summary.Precipitation);
    }

    [Fact]
    public void AtNightTheNightTileIsTheNightGoingOnNow()
    {
        // hours 0–5 of the forecast are −4 and cloudy; tomorrow's night (hours 24–29) is −7 and clear
        var summary = WeatherSummary.Build(Forecast(), Today.AddHours(3), "x")!;

        Assert.Equal(new WeatherPartDto("Ночь", -4, 3, "пасмурно"), summary.Parts.Single(x => x.Name == "Ночь"));
    }

    [Fact]
    public void StaleForecastWithoutTheCurrentHourGivesNothing() =>
        Assert.Null(WeatherSummary.Build(Forecast(), Today.AddDays(3), "x"));

    [Fact]
    public async Task TradePointAccountGetsWeatherAtItsPoint()
    {
        var (controller, weather) = Create(db => db.OfficeUser.Add(new OfficeUser
        {
            Id = 1, Login = "ll-zastavskaya30", Actual = 1, Locations = [Point("Заставская 30", 59.8912, 30.3301)]
        }), userId: 1);

        var now = (await controller.Get(CancellationToken.None)).Value!;

        Assert.Equal((59.89, 30.33), weather.Asked);
        Assert.Equal("Заставская 30", now.Place);
    }

    [Fact]
    public async Task EveryoneElseGetsTheCity()
    {
        var (controller, weather) = Create(db => db.OfficeUser.AddRange(
            new OfficeUser { Id = 1, Login = "tm", Actual = 1, Locations = [Point("Невский 35", 59.93, 30.35), Point("Марата 1", 59.93, 30.36)] },
            new OfficeUser { Id = 2, Login = "office", Actual = 1, DefaultLocations = 1 }), userId: 1);

        var now = (await controller.Get(CancellationToken.None)).Value!;

        Assert.Equal((59.94, 30.31), weather.Asked);
        Assert.Equal("Санкт-Петербург", now.Place);
    }

    [Fact]
    public async Task NoWeatherIsNoContent()
    {
        var (controller, _) = Create(_ => { }, userId: 1, weatherAvailable: false);

        Assert.IsType<NoContentResult>((await controller.Get(CancellationToken.None)).Result);
    }
}
