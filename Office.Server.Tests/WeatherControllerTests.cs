using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Weather;
using Xunit;

namespace Office.Server.Tests;

public class WeatherControllerTests
{
    // a Thursday, so the names of the following days are fixed
    private static readonly DateTime Today = new(2026, 11, 19);

    private sealed class Controller(RKNETDBContext db) : WeatherController(
        db, new MemoryCache(new MemoryCacheOptions()), new ConfigurationBuilder().Build())
    {
        protected override DateTime Today() => WeatherControllerTests.Today;
    }

    private static RKNETDBContext Db(params WeatherStatistic[] rows)
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.WeatherStatistics.AddRange(rows);
        db.SaveChanges();
        return db;
    }

    private static WeatherStatistic Day(int offset, double temperature, double rain = 0, int cloudiness = 7) =>
        new() { Date = Today.AddDays(offset), Temperature = temperature, Rain = rain, Wind = 2, Cloudiness = cloudiness };

    [Theory]
    [InlineData(3, 0, 2, 0)]       // clear
    [InlineData(3, 0, 4, 2)]       // partly cloudy
    [InlineData(3, 0, 7, 3)]       // overcast
    [InlineData(3, 0.2, 7, 53)]    // a trace of rain is drizzle
    [InlineData(3, 1.7, 7, 63)]    // rain
    [InlineData(-2, 0.2, 7, 71)]   // a little snow
    [InlineData(0, 3.7, 7, 73)]    // at zero it falls as snow
    public void PrecipitationBeatsClouds(double temperature, double rain, int cloudiness, int code) =>
        Assert.Equal(code, WeatherWeek.Code(temperature, rain, cloudiness));

    [Fact]
    public async Task ShowsTodayAndTheWeekAhead()
    {
        // the past day is not shown, the 8th day is beyond the week
        using var db = Db(Day(-1, 9), Day(0, 1.75, 1.02), Day(1, 4.25, 2.4, 8), Day(2, 1, 0, 7), Day(3, 1.75, 0.12),
            Day(4, 0.5, 3.72), Day(5, 1, 1.74), Day(6, 0.75, 0.42), Day(7, -5));

        var week = (await new Controller(db).Get(CancellationToken.None)).Value!;

        Assert.Equal((2, 63, "дождь", "Санкт-Петербург"), (week.Temperature, week.Code, week.Description, week.Place));
        Assert.Equal(["Сегодня", "Завтра", "Сб 21", "Вс 22", "Пн 23", "Вт 24", "Ср 25"], week.Days.Select(x => x.Name));
        Assert.Equal(new WeatherDayDto(Today.AddDays(1), "Завтра", 4, 63, "дождь", 2.4), week.Days[1]);
        Assert.Equal(0.4, week.Days[6].Rain);
    }

    [Fact]
    public async Task NoRowForTodayIsNoContent()
    {
        using var db = Db(Day(-1, 3), Day(1, 2));

        Assert.IsType<NoContentResult>((await new Controller(db).Get(CancellationToken.None)).Result);
    }
}
