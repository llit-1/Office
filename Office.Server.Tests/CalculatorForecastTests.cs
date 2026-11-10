using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.Calculator;
using Office.Server.Controllers;
using Office.Server.DbContexts.Calculator;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Xunit;

namespace Office.Server.Tests;

public class CalculatorForecastTests
{
    // 15.10.2026 — четверг
    private static readonly DateTime Thursday = new(2026, 10, 15, 10, 20, 0);
    private static readonly Guid Weekday = Guid.NewGuid();
    private static readonly Guid Friday = Guid.NewGuid();

    private static Guid? DayGroupOf(DateTime date) => date.DayOfWeek == DayOfWeek.Friday ? Friday : Weekday;

    private static ForecastItemInput Item(int code, Dictionary<(Guid, int), double> hourly, int lead = 0, int? group = null, bool blocked = false, double coefficient = 1) => new()
    {
        RkCode = code,
        Name = "Позиция " + code,
        Hourly = hourly,
        LeadMinutes = lead,
        ReplacementGroupId = group,
        Blocked = blocked,
        Coefficient = coefficient,
    };

    private static ForecastInput Input(DateTime? nextStart, params ForecastItemInput[] items) => new()
    {
        Now = Thursday,
        NextStart = nextStart,
        DayGroupOf = DayGroupOf,
        DayFactor = (_, _) => 1,
        Availability = 0.5,
        Items = items,
    };

    [Fact]
    public void Slots_CountTheRestOfCurrentHourAndPartOfLast()
    {
        var slots = CalculatorForecast.Slots(Thursday, Thursday.Date.AddHours(12.5)).ToList();

        Assert.Equal([(Thursday.Date.AddHours(10), 40 / 60.0), (Thursday.Date.AddHours(11), 1.0), (Thursday.Date.AddHours(12), 0.5)],
            slots.Select(x => (x.Start, Math.Round(x.Fraction, 6))).Select(x => (x.Start, x.Item2 == Math.Round(40 / 60.0, 6) ? 40 / 60.0 : x.Item2)));
    }

    [Fact]
    public void Z_IsNormalQuantile()
    {
        Assert.Equal(0, CalculatorForecast.Z(0.5), 6);
        Assert.Equal(0.8416, CalculatorForecast.Z(0.8), 3);
        Assert.Equal(1.6449, CalculatorForecast.Z(0.95), 3);
        Assert.Equal(2.3263, CalculatorForecast.Z(0.99), 3);
    }

    [Fact]
    public void Build_SumsHoursUntilNextStartPlusLead_WithFractionsAndTomorrowDayGroup()
    {
        // чт 10:20, следующий заход завтра в 05:30, позиция на витрине через 90 минут: считаем до пт 07:00
        var hourly = new Dictionary<(Guid, int), double>
        {
            [(Weekday, 10)] = 6,   // 40 минут → 4
            [(Weekday, 20)] = 3,
            [(Friday, 6)] = 10,    // пятница, 06:00–07:00 целиком
            [(Friday, 7)] = 100,   // уже за горизонтом
            [(Weekday, 6)] = 50,   // четверговое утро не повторяется в пятницу
        };

        var result = Assert.Single(CalculatorForecast.Build(Input(Thursday.Date.AddDays(1).AddHours(5.5), Item(1, hourly, lead: 90))));

        Assert.Equal(Thursday.Date.AddDays(1).AddHours(7), result.HorizonEnd);
        Assert.Equal(4 + 3 + 10, result.Expected, 6);
        Assert.Equal(result.Expected, result.Target, 6); // наличие 50% — без запаса
    }

    [Fact]
    public void Build_AppliesDayFactorsCoefficientsSafetyAndBlockedDemand()
    {
        var hourly = new Dictionary<(Guid, int), double> { [(Weekday, 11)] = 10, [(Weekday, 12)] = 10 };
        var input = new ForecastInput
        {
            Now = Thursday,
            NextStart = Thursday.Date.AddHours(13),
            DayGroupOf = DayGroupOf,
            // праздник: −20%, а позиции 3 — ещё акция ×1,5
            DayFactor = (_, code) => code == 3 ? 0.8 * 1.5 : 0.8,
            HourCoefficient = hour => hour == 12 ? 2 : 1,
            Availability = 0.8,
            Items =
            [
                Item(1, hourly, group: 7),
                Item(2, hourly, group: 7, blocked: true),
                Item(3, hourly, group: 7, coefficient: 1.1),
            ],
        };

        var results = CalculatorForecast.Build(input).ToDictionary(x => x.RkCode);

        // своя часть: 11 час — 10 × 0,8, 12 час — 10 × 0,8 × K3 2 = 24
        var own1 = 24.0;
        var own3 = (10 * 1.2 + 10 * 1.2 * 2) * 1.1;
        // заблокированная отдаёт 2/3 своего спроса двум свободным пропорционально их спросу
        var moved = 24.0 * (1 - 1 / 3.0);
        Assert.Equal(own1 + moved * own1 / (own1 + own3), results[1].Expected, 2);
        Assert.Equal(own3 + moved * own3 / (own1 + own3), results[3].Expected, 2);
        Assert.Equal(["Позиция 2"], results[1].AddFrom);
        Assert.Equal(results[1].Expected + CalculatorForecast.Z(0.8) * Math.Sqrt(results[1].Expected), results[1].Target, tolerance: 0.01);
    }

    [Fact]
    public void Build_WithoutWindows_CountsToTheEndOfDay()
    {
        var hourly = new Dictionary<(Guid, int), double> { [(Weekday, 23)] = 5, [(Friday, 0)] = 7 };

        var result = Assert.Single(CalculatorForecast.Build(Input(null, Item(1, hourly))));

        Assert.Equal(Thursday.Date.AddDays(1), result.HorizonEnd);
        Assert.Equal(5, result.Expected, 6);
    }

    [Fact]
    public void Weather_RainSnowHeatAndColdChangeTrafficAndMix()
    {
        var settings = ForecastSettings.Default;
        var day = Thursday.Date;

        Assert.Same(WeatherEffect.None, WeatherEffect.For(null, settings, null, 0, 0));
        var rain = WeatherEffect.For(new WeatherDay(day, 5, 0, 12), settings, null, -0.09, -0.08);
        Assert.Equal((0.95, 1.0, "дождь"), (rain.Traffic, rain.Mix, Assert.Single(rain.Notes)));
        // у точки своя реакция на дождь
        Assert.Equal(0.81, WeatherEffect.For(new WeatherDay(day, 5, 0, 12), settings, -0.19, 0, 0).Traffic, 6);
        var snow = WeatherEffect.For(new WeatherDay(day, 5, 3, -8), settings, null, -0.09, -0.08);
        Assert.Equal((0.935, 0.92), (snow.Traffic, snow.Mix));
        Assert.Equal(["снегопад", "мороз"], snow.Notes);
        var heat = WeatherEffect.For(new WeatherDay(day, 0, 0, 29), settings, null, -0.09, -0.08);
        Assert.Equal(0.94 * 0.91, heat.Factor, 6);
        // тёплый день без жары: поток как обычно, но кондитерку берут меньше
        Assert.Equal((1.0, 0.91), (WeatherEffect.For(new WeatherDay(day, 0, 0, 25.5), settings, null, -0.09, 0).Traffic, WeatherEffect.For(new WeatherDay(day, 0, 0, 25.5), settings, null, -0.09, 0).Mix));
    }

    [Fact]
    public void OpenMeteo_IsReducedToWorkingHoursOfEachDay()
    {
        var times = Enumerable.Range(0, 48).Select(h => $"\"{new DateTime(2026, 10, 15).AddHours(h):yyyy-MM-ddTHH:mm}\"");
        var temperature = Enumerable.Range(0, 48).Select(h => h % 24 == 14 ? "12.5" : h % 24 == 3 ? "30" : "8");
        var precipitation = Enumerable.Range(0, 48).Select(h => h is 9 or 10 ? "2.5" : h == 2 ? "9" : "0");
        var json = $"{{\"hourly\":{{\"time\":[{string.Join(',', times)}],\"temperature_2m\":[{string.Join(',', temperature)}],\"precipitation\":[{string.Join(',', precipitation)}],\"snowfall\":[{string.Join(',', Enumerable.Repeat("0", 48))}]}}}}";

        var days = OpenMeteoWeather.Parse(json);

        Assert.Equal(new WeatherDay(new DateTime(2026, 10, 15), 5, 0, 12.5), days[new DateTime(2026, 10, 15)]);
        Assert.Equal(0, days[new DateTime(2026, 10, 16)].PrecipitationMm);
    }

    [Fact]
    public void Holidays_AreLawDatesWithMeasuredFactors()
    {
        var holidays = CalculatorPlanningStore.Holidays();

        Assert.All(holidays, x => Assert.True(x.DateFrom <= x.DateTo && x.Factor is > 0.5 and < 1));
        Assert.Contains(holidays, x => x.DateFrom == new DateTime(2027, 1, 1) && x.DateTo == new DateTime(2027, 1, 8) && x.Factor == 0.71);
        Assert.Equal(CalculatorCategories.All.Select(x => x.Slug).OrderBy(x => x), CalculatorPlanningStore.CategoryDefaults.Keys.OrderBy(x => x));
    }

    /* ===== Настройки технолога ===== */

    private const int Tt = 1023253;
    private static readonly Guid Bakery = CalculatorCategories.Find("bakery")!.Group;

    private sealed record Env(RKNETDBContext Db, CalculatorDbContext Calc, CalculatorPlanningController Controller) : IDisposable
    {
        public void Dispose()
        {
            Db.Dispose();
            Calc.Dispose();
        }
    }

    private static Env CreateEnv(IReadOnlyDictionary<DateTime, WeatherDay>? weather = null)
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.OfficeCalculatorEntryWindows.Add(new OfficeCalculatorEntryWindow { Category = "bakery", StartMinute = 15 * 60 + 30, EndMinute = 17 * 60 });
        db.SaveChanges();

        var calc = new CalculatorDbContext(new DbContextOptionsBuilder<CalculatorDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var weekday = new CalcDayGroup { Guid = Guid.NewGuid(), Name = "Пн-Пт", FirstDay = 1, LastDay = 5, FirstDayUS = 1, LastDayUS = 5 };
        var weekend = new CalcDayGroup { Guid = Guid.NewGuid(), Name = "Сб-Вс", FirstDay = 6, LastDay = 7, FirstDayUS = 0, LastDayUS = 6 };
        var allDay = new CalcTimeGroup { Guid = Guid.NewGuid(), Name = "Весь день", FirstHour = 0, LastHour = 23, ItemsGroup = Bakery };
        var pair = new CalcTimeDayGroup { Guid = Guid.NewGuid(), Name = "Пн-Пт", TimeGroupGuid = allDay.Guid, DayGroupGuid = weekday.Guid };
        calc.ItemsGroups.Add(new CalcItemsGroup { Guid = Bakery, Name = "Выпечные изделия", HourForProduction = 1 });
        calc.TTs.Add(new CalcTT { TTCode = Tt, TTName = "Невский 96" });
        calc.DayGroups.AddRange(weekday, weekend);
        calc.TimeGroups.Add(allDay);
        calc.TimeDayGroups.Add(pair);
        calc.Items.Add(new CalcItem { RkCode = 1, Name = "Круассан", ItemsGroup = Bakery, Coefficient = 1.3, Sequence = 1 });
        var onTT = new CalcItemOnTT { Guid = Guid.NewGuid(), Name = "Круассан", TTCode = Tt, ItemRkCode = 1, Coefficient = 1 };
        calc.ItemOnTT.Add(onTT);
        // по 10 штук в 14 и в 15 часов за 10 дней — по 1 в час
        calc.Sales.AddRange(
            new CalcSales { ItemOnTTGUID = onTT.Guid, TimeDayGroupsGUID = pair.Guid, Hour = 14, Quantity = 10, SettlementDays = 10 },
            new CalcSales { ItemOnTTGUID = onTT.Guid, TimeDayGroupsGUID = pair.Guid, Hour = 15, Quantity = 10, SettlementDays = 10 });
        calc.SaveChanges();
        db.ChangeTracker.Clear();
        calc.ChangeTracker.Clear();

        var store = new CalculatorPlanningStore();
        var controller = new CalculatorPlanningController(db, calc, store, new CalculatorForecastService(calc, store, new CalculatorTests.FakeWeather(weather)))
        {
            Now = () => Thursday,
        };
        return new Env(db, calc, controller);
    }

    [Fact]
    public async Task Planning_SavesStoresCategoriesItemsAndSettingsWithValidation()
    {
        using var env = CreateEnv();

        Assert.IsType<BadRequestObjectResult>(await env.Controller.SaveStore(Tt, new() { Forecast = true, OvenTrays = 0 }, default));
        Assert.IsType<NotFoundObjectResult>(await env.Controller.SaveStore(42, new() { Forecast = true }, default));
        Assert.IsType<NoContentResult>(await env.Controller.SaveStore(Tt, new() { Forecast = true, OvenTrays = 6, RainEffect = -0.19 }, default));

        Assert.IsType<BadRequestObjectResult>(env.Controller.SaveCategory("bakery", new() { Availability = 0.3, LeadMinutes = 60 }).Result);
        var category = Assert.IsType<OkObjectResult>(env.Controller.SaveCategory("bakery", new() { Availability = 0.9, LeadMinutes = 30, HeatEffect = -0.02 }).Result);
        Assert.Equal(0.9, Assert.IsType<CalculatorPlanningController.PlanningCategoryDto>(category.Value).Availability);

        Assert.IsType<BadRequestObjectResult>(await env.Controller.SaveItem(1, new() { LeadMinutes = 2000 }, default));
        Assert.IsType<NoContentResult>(await env.Controller.SaveItem(1, new() { LeadMinutes = 45, TrayCapacity = 12, Program = " Р1 " }, default));

        Assert.IsType<BadRequestObjectResult>(env.Controller.SaveSettings(new() { ["unknown"] = 1 }));
        Assert.IsType<BadRequestObjectResult>(env.Controller.SaveSettings(new() { ["urgent_minutes"] = 5 }));
        Assert.IsType<NoContentResult>(env.Controller.SaveSettings(new() { ["urgent_minutes"] = 90, ["rain_mm"] = 3 }));

        var planning = Assert.IsType<CalculatorPlanningController.PlanningDto>(Assert.IsType<OkObjectResult>((await env.Controller.Get(default)).Result).Value);
        Assert.Equal((true, (int?)6, (double?)-0.19), (planning.Stores.Single().Forecast, planning.Stores.Single().OvenTrays, planning.Stores.Single().RainEffect));
        Assert.Equal((90.0, 3.0), (planning.Settings["urgent_minutes"], planning.Settings["rain_mm"]));
        Assert.Equal((45, 12, "Р1"), (planning.Items.Single().LeadMinutes!.Value, planning.Items.Single().TrayCapacity!.Value, planning.Items.Single().Program));
        Assert.Equal(5, planning.Categories.Count);
    }

    [Fact]
    public async Task Modifiers_AreValidatedAndChangeThePreview()
    {
        var day = Thursday.Date;
        using var env = CreateEnv(new Dictionary<DateTime, WeatherDay> { [day] = new(day, 6, 0, 14) });

        var before = Assert.IsType<CalculatorPlanningController.ForecastPreviewDto>(Assert.IsType<OkObjectResult>((await env.Controller.Preview(Tt, "bakery", default)).Result).Value);
        // до 15:30 + час до витрины: 14 и 15 часов целиком, дождь −5%
        Assert.Equal(2 * 0.95, Assert.Single(before.Items).Expected, 3);
        Assert.False(before.Enabled);
        Assert.Contains("дождь", Assert.Single(before.Notes));

        Assert.IsType<BadRequestObjectResult>((await env.Controller.SaveModifier(new() { Kind = "party", Title = "x", From = day, To = day, Factor = 1 }, default)).Result);
        Assert.IsType<BadRequestObjectResult>((await env.Controller.SaveModifier(new() { Kind = "event", Title = "Матч", From = day, To = day.AddDays(-1), Factor = 1.2 }, default)).Result);
        var saved = Assert.IsType<OkObjectResult>((await env.Controller.SaveModifier(new() { Kind = "event", Title = "Матч на стадионе", From = day, To = day, Tt = Tt, Factor = 1.5 }, default)).Result);
        var id = Assert.IsType<CalculatorPlanningController.PlanningModifierDto>(saved.Value).Id!.Value;

        var after = Assert.IsType<CalculatorPlanningController.ForecastPreviewDto>(Assert.IsType<OkObjectResult>((await env.Controller.Preview(Tt, "bakery", default)).Result).Value);
        Assert.Equal(2 * 0.95 * 1.5, Assert.Single(after.Items).Expected, 3);
        Assert.Contains("Матч на стадионе", Assert.Single(after.Notes));

        Assert.IsType<NoContentResult>(env.Controller.DeleteModifier(id));
        Assert.IsType<NotFoundObjectResult>(env.Controller.DeleteModifier(id));
        // остались только праздники по закону
        var calendar = Assert.IsType<List<CalculatorPlanningController.PlanningModifierDto>>(Assert.IsType<OkObjectResult>(env.Controller.GetModifiers().Result).Value);
        Assert.All(calendar, x => Assert.Equal("holiday", x.Kind));
        Assert.Contains(calendar, x => x.From == new DateTime(2026, 11, 4));
    }
}
