using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Configuration;
using System.Net;
using System.Text.Json.Nodes;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.Calculator;
using Office.Server.Controllers;
using Office.Server.DbContexts.Calculator;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Services;
using Xunit;

namespace Office.Server.Tests;

public class CalculatorTests
{
    private const int Tt = 1023253;
    private const int ForeignTt = 1001420;
    private static readonly Guid Bakery = CalculatorCategories.Find("bakery")!.Group;
    // 15.10.2026 — четверг
    private static readonly DateTime Thursday = new(2026, 10, 15, 10, 5, 0);

    private static readonly CalcDayGroup MonWed = Day("Пн-Ср", 1, 3, 1, 3);
    private static readonly CalcDayGroup ThuFri = Day("Чт-Пт", 4, 5, 4, 5);
    private static readonly CalcDayGroup Sat = Day("Сб", 6, 6, 6, 6);
    private static readonly CalcDayGroup Sun = Day("Вс", 7, 7, 0, 0);
    private static readonly CalcDayGroup[] Days = [MonWed, ThuFri, Sat, Sun];

    private static readonly CalcTimeGroup Night = Time("Ночь-Утро(Выпечные изделия)", 0, 6);
    private static readonly CalcTimeGroup Morning = Time("Утро(Выпечные изделия)\n", 7, 11);
    private static readonly CalcTimeGroup Noon = Time("День(Выпечные изделия)\n", 12, 17);
    private static readonly CalcTimeGroup Evening = Time("Вечер(Выпечные изделия)\n", 18, 23);
    private static readonly CalcTimeGroup[] Times = [Night, Morning, Noon, Evening];

    private static readonly CalcTimeDayGroup[] Pairs = Times
        .SelectMany(t => Days.Select(d => new CalcTimeDayGroup { Guid = Guid.NewGuid(), Name = d.Name + " " + t.Name, TimeGroupGuid = t.Guid, DayGroupGuid = d.Guid }))
        .ToArray();

    private static CalcDayGroup Day(string name, int first, int last, int firstUs, int lastUs) =>
        new() { Guid = Guid.NewGuid(), Name = name, FirstDay = first, LastDay = last, FirstDayUS = firstUs, LastDayUS = lastUs };

    private static CalcTimeGroup Time(string name, int first, int last) =>
        new() { Guid = Guid.NewGuid(), Name = name, FirstHour = first, LastHour = last, ItemsGroup = Bakery };

    private static CalcTimeDayGroup Pair(CalcTimeGroup time, CalcDayGroup day) =>
        Pairs.Single(x => x.TimeGroupGuid == time.Guid && x.DayGroupGuid == day.Guid);

    private static PeriodPlan Plan(DateTime now, CalcDayGroup? specialToday = null, CalcDayGroup? specialTomorrow = null)
    {
        var days = CalculatorPeriods.ResolveDays(now, Days, specialToday, specialTomorrow)!.Value;
        return CalculatorPeriods.Resolve(now, Times, days.Today, days.Tomorrow, Pairs)!;
    }

    /* ===== Периоды ===== */

    [Fact]
    public void Periods_InTheMiddleOfTheDay_TakeTwoNextPeriodsOfToday()
    {
        var plan = Plan(Thursday);

        Assert.Equal(Pair(Morning, ThuFri), plan.This.TimeDayGroup);
        Assert.Equal(Pair(Noon, ThuFri), plan.Next.TimeDayGroup);
        Assert.Equal(Pair(Evening, ThuFri), plan.Second.TimeDayGroup);
        Assert.Equal("Утро", CalculatorPeriods.CleanName(plan.This.TimeGroup.Name));
    }

    [Fact]
    public void Periods_AtTheEndOfDay_GoToTomorrowDayGroup()
    {
        // пятница вечер: завтра суббота
        var friday = Plan(new DateTime(2026, 10, 16, 19, 0, 0));
        Assert.Equal(Pair(Evening, ThuFri), friday.This.TimeDayGroup);
        Assert.Equal(Pair(Night, Sat), friday.Next.TimeDayGroup);
        Assert.Equal(Pair(Morning, Sat), friday.Second.TimeDayGroup);

        // пятница днём: следующий — вечер сегодня, за ним ночь субботы
        var noon = Plan(new DateTime(2026, 10, 16, 13, 0, 0));
        Assert.Equal(Pair(Evening, ThuFri), noon.Next.TimeDayGroup);
        Assert.Equal(Pair(Night, Sat), noon.Second.TimeDayGroup);

        // воскресенье вечер: завтра понедельник
        var sunday = Plan(new DateTime(2026, 10, 18, 20, 0, 0));
        Assert.Equal(Pair(Evening, Sun), sunday.This.TimeDayGroup);
        Assert.Equal(Pair(Night, MonWed), sunday.Next.TimeDayGroup);
    }

    [Fact]
    public void Periods_SpecialDayReplacesDayGroup()
    {
        var plan = Plan(Thursday, specialToday: Sun);

        Assert.Equal(Pair(Morning, Sun), plan.This.TimeDayGroup);
    }

    /* ===== Расчёт строк ===== */

    private static CalcItem Item(int code, string name, int? group = null) =>
        new() { RkCode = code, Name = name, ItemsGroup = Bakery, Coefficient = 1.15, Sequence = code, MinShowCase = 4, ReplacementGroupId = group };

    private static CalcItemOnTT OnTT(int code, int tt = Tt, double coefficient = 1) =>
        new() { Guid = Guid.NewGuid(), Name = code.ToString(), TTCode = tt, ItemRkCode = code, Coefficient = coefficient };

    private static IEnumerable<CalcSales> Sales(CalcItemOnTT onTT, CalcTimeDayGroup pair, int days, params (int Hour, int Quantity)[] hours) =>
        hours.Select(h => new CalcSales { ItemOnTTGUID = onTT.Guid, TimeDayGroupsGUID = pair.Guid, Hour = h.Hour, Quantity = h.Quantity, SettlementDays = days });

    private static CalculatorSources Sources(
        IReadOnlyList<CalcItem> items,
        IReadOnlyList<CalcItemOnTT> onTT,
        IReadOnlyList<CalcSales> sales,
        IReadOnlyList<CalcItemBlock>? blocks = null,
        IReadOnlyList<CalcReplacement>? replacements = null,
        IReadOnlyList<CalcItem>? extraItems = null) => new()
        {
            Now = Thursday,
            TTCode = Tt,
            Group = new CalcItemsGroup { Guid = Bakery, Name = "Выпечные изделия", HourForProduction = 1 },
            Periods = Plan(Thursday),
            Coefficients = new Dictionary<Guid, double> { [Morning.Guid] = 1.234, [Noon.Guid] = 0.9 },
            GroupItems = items,
            ItemsByCode = items.Concat(extraItems ?? []).ToDictionary(x => x.RkCode),
            ItemsOnTT = onTT,
            Replacements = replacements ?? [],
            Sales = sales,
            Blocks = blocks ?? [],
        };

    [Fact]
    public void Engine_AveragesSalesAfterCurrentHourAndSeparatesProductionHour()
    {
        var croissant = Item(1, "Круассан ");
        var onTT = OnTT(1);
        var sales = Sales(onTT, Pair(Morning, ThuFri), 4, (9, 40), (10, 40), (11, 8))
            .Concat(Sales(onTT, Pair(Noon, ThuFri), 4, (12, 12), (13, 4)))
            .Concat(Sales(onTT, Pair(Evening, ThuFri), 2, (18, 3)))
            .ToList();

        var result = CalculatorEngine.Build(Sources([croissant], [onTT], sales));

        var row = Assert.Single(result.Rows);
        // в 10:05 считаем часы после 10-го: 11-й; на выпечку уходит час — 11 < 10 + 1 не входит
        Assert.Equal(2, row.AvgRest);
        Assert.Equal(0, row.AvgProduction);
        Assert.Equal(4, row.AvgNext);
        Assert.Equal(1.5, row.AvgSecond);
        Assert.Equal(1.23, result.ThisCoefficient);
        Assert.Equal(0.9, result.NextCoefficient);
        // нет коэффициента у периода — 1, как будто поправки нет
        Assert.Equal(1, result.SecondCoefficient);
    }

    [Fact]
    public void Engine_SkipsItemsThatAreNotSoldOnTheStore()
    {
        var result = CalculatorEngine.Build(Sources([Item(1, "Круассан"), Item(2, "Слойка")], [OnTT(1)], []));

        Assert.Equal([1], result.Rows.Select(x => x.Item.RkCode));
    }

    [Fact]
    public void Engine_UsesAnalogItemAndStoreSales()
    {
        var item = Item(1, "Слойка с морошкой");
        var analog = Item(2, "Слойка миндальная");
        var own = OnTT(1);
        var analogOnOtherTt = OnTT(2, tt: ForeignTt);
        var sales = Sales(analogOnOtherTt, Pair(Morning, ThuFri), 2, (11, 6)).ToList();
        var replacements = new List<CalcReplacement>
        {
            new() { Id = 1, ItemCode = 1, ReplacementItemCode = 2, Begin = Thursday.Date, End = Thursday.Date.AddDays(7) },
            new() { Id = 2, TTCode = Tt, ReplacementTTCode = ForeignTt, Begin = Thursday.Date, End = Thursday.Date.AddDays(7) },
        };

        var result = CalculatorEngine.Build(Sources([item], [own, analogOnOtherTt], sales, replacements: replacements, extraItems: [analog]));

        var row = Assert.Single(result.Rows);
        Assert.Equal(3, row.AvgRest);
        // коэффициенты и название — у своей позиции на своей точке
        Assert.Same(own, row.OnTT);
        Assert.Same(item, row.Item);
    }

    [Fact]
    public void Engine_MovesDemandOfBlockedItemToFreeItemsOfItsReplacementGroup()
    {
        var cinnamon = Item(1, "Улитка с корицей", group: 16);
        var raisin = Item(2, "Улитка с изюмом", group: 16);
        var dubai = Item(3, "Улитка Дубайская", group: 16);
        var other = Item(4, "Сосиска в тесте", group: 17);
        var onTT = new[] { OnTT(1), OnTT(2), OnTT(3), OnTT(4) };
        var morning = Pair(Morning, ThuFri);
        var sales = Sales(onTT[0], morning, 1, (11, 3))
            .Concat(Sales(onTT[1], morning, 1, (11, 1)))
            .Concat(Sales(onTT[2], morning, 1, (11, 6)))
            .Concat(Sales(onTT[3], morning, 1, (11, 5)))
            .ToList();
        var blocks = new List<CalcItemBlock> { new() { Id = 7, ItemRkCode = 3, TTCode = Tt, Type = 1, Enable = true } };

        var rows = CalculatorEngine.Build(Sources([cinnamon, raisin, dubai, other], onTT, sales, blocks)).Rows;

        // заблокирована 1 из 3: переходит 2/3 её спроса (6 × 2/3 = 4), делится 3 : 1
        Assert.Equal(3, rows[0].AddThis, 6);
        Assert.Equal(1, rows[1].AddThis, 6);
        Assert.Equal(["Улитка Дубайская"], rows[0].AddFrom);
        Assert.Equal(0, rows[2].AddThis);
        Assert.Equal(7, rows[2].Block!.Id);
        Assert.Equal(0, rows[3].AddThis);
        Assert.Empty(rows[3].AddFrom);
    }

    [Fact]
    public void ConnectionString_PointsToCalculatorDatabaseOnTheSameServer()
    {
        var value = CalculatorDbContext.ConnectionStringFrom("Data Source=srv\\SQL2019; Initial Catalog=RKNET; User ID=rk7; Password=x; TrustServerCertificate=True");

        var builder = new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(value);
        Assert.Equal(("srv\\SQL2019", "CALCULATOR", "rk7", true), (builder.DataSource, builder.InitialCatalog, builder.UserID, builder.TrustServerCertificate));
    }

    /* ===== Подпись блокировки ===== */

    [Fact]
    public void DescribeBlock_ExplainsWhoBlockedAndWhetherStoreCanUnlock()
    {
        var own = CalculatorController.DescribeBlock(new CalcItemBlock { Type = 1, TTCode = Tt, Info = "Заполнил: Розница Невский 96 16.10.2026 6:40:47" }, Tt);
        Assert.Equal(("soft", true, "Заблокировал(а) Розница Невский 96 в 6:40"), (own.Kind, own.CanUnlock, own.Text));

        var everywhere = CalculatorController.DescribeBlock(new CalcItemBlock { Type = 1, TTCode = null }, Tt);
        Assert.Equal(("hard", false), (everywhere.Kind, everywhere.CanUnlock));

        var auditor = CalculatorController.DescribeBlock(new CalcItemBlock { Type = 2, Begin = new DateTime(2026, 10, 15), End = new DateTime(2026, 10, 21) }, Tt);
        Assert.Equal("Аудитор снял с продажи до 20 октября", auditor.Text);
    }

    /* ===== Контроллер ===== */

    private sealed class FakeSink : ICalculatorLogSink
    {
        public List<CalculatorLogRecord> Sent { get; } = [];
        public bool Fail { get; set; }

        public Task SendAsync(CalculatorLogRecord entry, CancellationToken ct = default)
        {
            if (Fail)
                throw new HttpRequestException("Buffer недоступен");
            Sent.Add(entry);
            return Task.CompletedTask;
        }
    }

    /// <summary>Погода не нужна этим тестам: прогноза нет — расчёт идёт без погоды.</summary>
    internal sealed class FakeWeather(IReadOnlyDictionary<DateTime, WeatherDay>? days = null) : IWeatherForecast
    {
        public Task<IReadOnlyDictionary<DateTime, WeatherDay>> GetAsync(double latitude, double longitude, CancellationToken ct) =>
            Task.FromResult(days ?? new Dictionary<DateTime, WeatherDay>());
    }

    private sealed record Env(RKNETDBContext Db, CalculatorDbContext Calc, FakeSink Sink, CalculatorController Controller) : IDisposable
    {
        public void Dispose()
        {
            Db.Dispose();
            Calc.Dispose();
        }
    }

    private static Env CreateEnv(int userId = 5)
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var school = new LocationType { Guid = Guid.NewGuid(), Name = "УЦ" };
        db.LocationTypes.Add(school);
        var user = new OfficeUser("nevsky96", "Невский 96") { Id = 5, Surname = "Розница", Actual = 1 };
        user.Locations.Add(new Location { Guid = Guid.NewGuid(), Name = "Невский 96", RKCode = Tt, Actual = 1 });
        user.Locations.Add(new Location { Guid = Guid.NewGuid(), Name = "УЦ Воскова", RKCode = 66, Actual = 1, LocationTypeGuid = school.Guid });
        user.Locations.Add(new Location { Guid = Guid.NewGuid(), Name = "Склад", Actual = 1 });
        // есть код R-Keeper, но в калькуляторе такой точки нет
        user.Locations.Add(new Location { Guid = Guid.NewGuid(), Name = "Кабинет № 400", RKCode = 400, Actual = 1 });
        db.Locations.Add(new Location { Guid = Guid.NewGuid(), Name = "Захарьевская 25", RKCode = ForeignTt, Actual = 1 });
        db.OfficeUser.Add(user);
        db.CalculatorLogs.AddRange(
            new CalculatorLogEntry { Id = 1, TTCode = Tt, ItemCode = 1, Rest = 1, Result = 9, Date = Thursday.AddDays(-1) },
            new CalculatorLogEntry { Id = 2, TTCode = Tt, ItemCode = 1, Rest = 2, Result = 7, Date = Thursday.AddHours(-3) },
            new CalculatorLogEntry { Id = 3, TTCode = Tt, ItemCode = 1, Rest = 3, Result = 8, Fact = 6, Date = Thursday.AddMinutes(-20) },
            new CalculatorLogEntry { Id = 4, TTCode = ForeignTt, ItemCode = 2, Rest = 5, Result = 1, Date = Thursday.AddMinutes(-10) });
        db.SaveChanges();

        var calc = new CalculatorDbContext(new DbContextOptionsBuilder<CalculatorDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        calc.ItemsGroups.Add(new CalcItemsGroup { Guid = Bakery, Name = "Выпечные изделия", HourForProduction = 1 });
        calc.TTs.AddRange(new CalcTT { TTCode = Tt, TTName = "Невский 96" }, new CalcTT { TTCode = ForeignTt, TTName = "Захарьевская 25" }, new CalcTT { TTCode = 66, TTName = "УЦ Воскова" });
        calc.DayGroups.AddRange(Days.Select(Clone));
        calc.TimeGroups.AddRange(Times.Select(Clone));
        calc.TimeDayGroups.AddRange(Pairs.Select(Clone));
        calc.Reactions.Add(new CalcReaction { Guid = Guid.NewGuid(), ItemsGroup = Bakery, FirstHour = 9, LastHour = 15, Reaction = 2 });
        calc.Items.AddRange(Item(1, "Круассан"), Item(2, "Слойка с мясом"));
        var croissant = OnTT(1);
        calc.ItemOnTT.AddRange(croissant, OnTT(2));
        calc.Sales.AddRange(Sales(croissant, Pair(Morning, ThuFri), 4, (11, 8)));
        calc.ItemBlocks.Add(new CalcItemBlock { Id = 1, ItemRkCode = 2, TTCode = null, Type = 3, Enable = true, Begin = Thursday.Date, End = Thursday.Date.AddDays(3) });
        calc.SaveChanges();
        db.ChangeTracker.Clear();
        calc.ChangeTracker.Clear();

        var sink = new FakeSink();
        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString()), new Claim(ClaimTypes.Role, "Calculator")], "Test");
        var controller = new CalculatorController(db, calc, new GlobalService(db), new CalculatorService(calc, db), sink, NullLogger<CalculatorController>.Instance)
        {
            Now = () => Thursday,
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) } },
        };
        return new Env(db, calc, sink, controller);
    }

    private static T Clone<T>(T value) where T : class, new()
    {
        var copy = new T();
        foreach (var property in typeof(T).GetProperties().Where(x => x.CanWrite))
            property.SetValue(copy, property.GetValue(value));
        return copy;
    }

    private static T OkValue<T>(ActionResult<T> result) => Assert.IsType<T>(Assert.IsType<OkObjectResult>(result.Result).Value);

    [Fact]
    public async Task Locations_AreUserStoresOfCalculatorWithoutTrainingCenters()
    {
        using var env = CreateEnv();

        var locations = OkValue(await env.Controller.GetLocations(default));

        Assert.Equal([(Tt, "Невский 96")], locations.Select(x => (x.Code, x.Name)));
    }

    [Fact]
    public async Task Sheet_ReturnsItemsWithLastInputAndBlocks()
    {
        using var env = CreateEnv();

        var sheet = OkValue(await env.Controller.GetSheet("bakery", Tt, default));

        Assert.Equal(("Утро", 7, 11, 2, 18), (sheet.Period, sheet.PeriodFrom, sheet.PeriodTo, sheet.Reaction, sheet.HorizonHour));
        var croissant = sheet.Items[0];
        Assert.Equal(("Круассан", 2.0, 1.15), (croissant.Name, croissant.AvgRest, croissant.ItemCoefficient));
        // как в старом портале: последний ввод за полчаса
        Assert.Equal((3, 8, 6), (croissant.Last!.Rest, croissant.Last.Result, croissant.Last.Fact));
        Assert.Equal(("hard", false), (sheet.Items[1].Block!.Kind, sheet.Items[1].Block!.CanUnlock));
    }

    [Fact]
    public async Task Sheet_IsNotAvailableForForeignStoreOrUnknownCategory()
    {
        using var env = CreateEnv();

        Assert.IsType<NotFoundObjectResult>((await env.Controller.GetSheet("bakery", ForeignTt, default)).Result);
        Assert.IsType<NotFoundObjectResult>((await env.Controller.GetSheet("pizza", Tt, default)).Result);
    }

    [Fact]
    public async Task SaveEntry_SendsInputToBufferWithUserAndStore()
    {
        using var env = CreateEnv();

        var saved = OkValue(await env.Controller.SaveEntry("bakery", new() { Tt = Tt, RkCode = 1, Rest = 3, Result = 8, Fact = 6 }, default));

        Assert.Equal(Thursday, saved.SavedAt);
        var entry = Assert.Single(env.Sink.Sent);
        Assert.Equal(("Розница Невский 96", 1, "Круассан", Tt, "Невский 96", 3, 8, 6, Thursday),
            (entry.UserName, entry.ItemCode, entry.ItemName, entry.TTCode, entry.TTName, entry.Rest, entry.Result, entry.Fact, entry.Date));
        // сессия всегда есть (пустая ломает пачку в Buffer) и одна на час: триггер лога оставит последнюю строку
        Assert.NotEqual(Guid.Empty, entry.SessionId);
        await env.Controller.SaveEntry("bakery", new() { Tt = Tt, RkCode = 1, Rest = 2, Result = 9 }, default);
        Assert.Equal(entry.SessionId, env.Sink.Sent[1].SessionId);
        Assert.NotEqual(entry.SessionId, CalculatorLogRecord.SessionFor(999, Thursday));
        // следующий час: другая сессия, прошлые строки триггер не трогает
        Assert.NotEqual(CalculatorLogRecord.SessionFor(1, Thursday.Date.AddHours(6)), CalculatorLogRecord.SessionFor(1, Thursday.Date.AddHours(10)));
    }

    [Fact]
    public async Task SaveEntry_RejectsBadInputForeignStoreAndItemOfOtherCategory()
    {
        using var env = CreateEnv();

        Assert.IsType<BadRequestObjectResult>((await env.Controller.SaveEntry("bakery", new() { Tt = Tt, RkCode = 1, Rest = null, Result = 8 }, default)).Result);
        Assert.IsType<BadRequestObjectResult>((await env.Controller.SaveEntry("bakery", new() { Tt = Tt, RkCode = 1, Rest = 10000, Result = 8 }, default)).Result);
        Assert.IsType<NotFoundObjectResult>((await env.Controller.SaveEntry("bakery", new() { Tt = ForeignTt, RkCode = 1, Rest = 3, Result = 8 }, default)).Result);
        Assert.IsType<NotFoundObjectResult>((await env.Controller.SaveEntry("bread", new() { Tt = Tt, RkCode = 1, Rest = 3, Result = 8 }, default)).Result);
        Assert.Empty(env.Sink.Sent);
    }

    [Fact]
    public async Task SaveEntry_WorksAtAnyTimeOfDay()
    {
        using var env = CreateEnv();
        env.Controller.Now = () => Thursday.Date.AddHours(23).AddMinutes(40);

        Assert.IsType<OkObjectResult>((await env.Controller.SaveEntry("bakery", new() { Tt = Tt, RkCode = 1, Rest = 3, Result = 8 }, default)).Result);

        Assert.Single(env.Sink.Sent);
    }

    [Fact]
    public async Task Sheet_ForgetsInputOlderThanThirtyMinutes()
    {
        using var env = CreateEnv();
        env.Controller.Now = () => Thursday.AddMinutes(11);

        var sheet = OkValue(await env.Controller.GetSheet("bakery", Tt, default));

        Assert.Null(sheet.Items[0].Last);
    }

    [Fact]
    public async Task Sheet_LogsBlockedItemsOnEveryOpen_AndKeepsWorkingWithoutBuffer()
    {
        using var env = CreateEnv();

        await env.Controller.GetSheet("bakery", Tt, default);

        var logged = Assert.Single(env.Sink.Sent);
        Assert.Equal((2, 0, -1, (int?)null), (logged.ItemCode, logged.Rest, logged.Result, logged.Fact));

        env.Sink.Fail = true;
        Assert.IsType<OkObjectResult>((await env.Controller.GetSheet("bakery", Tt, default)).Result);
    }

    [Fact]
    public async Task BufferSink_PostsTheEntryOneToOne()
    {
        var handler = new BufferHandler();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Calculator:BufferUrl"] = "http://buffer.test/Buffer" })
            .Build();
        var sink = new HttpCalculatorLogSink(handler, configuration);
        var session = CalculatorLogRecord.SessionFor(5, Thursday);

        await sink.SendAsync(new CalculatorLogRecord { UserName = "Розница", ItemCode = 1, ItemName = "Круассан", TTCode = Tt, TTName = "Невский 96", Rest = 3, Result = 8, Date = Thursday, SessionId = session });

        Assert.Equal("http://buffer.test/Buffer", handler.Url);
        var body = JsonNode.Parse(handler.Body!)!;
        Assert.Equal((1, "Круассан", 3, 8, session.ToString()), (body["itemCode"]!.GetValue<int>(), body["itemName"]!.GetValue<string>(), body["rest"]!.GetValue<int>(), body["result"]!.GetValue<int>(), body["sessionId"]!.GetValue<string>()));

        handler.Status = HttpStatusCode.InternalServerError;
        await Assert.ThrowsAsync<HttpRequestException>(() => sink.SendAsync(new CalculatorLogRecord { SessionId = session }));
    }

    private sealed class BufferHandler : HttpMessageHandler, IHttpClientFactory
    {
        public string? Url { get; private set; }
        public string? Body { get; private set; }
        public HttpStatusCode Status { get; set; } = HttpStatusCode.OK;

        public HttpClient CreateClient(string name) => new(this, disposeHandler: false);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Url = request.RequestUri!.ToString();
            Body = await request.Content!.ReadAsStringAsync(cancellationToken);
            return new HttpResponseMessage(Status);
        }
    }

    [Fact]
    public async Task SaveEntry_ReportsBufferFailure()
    {
        using var env = CreateEnv();
        env.Sink.Fail = true;

        var result = await env.Controller.SaveEntry("bakery", new() { Tt = Tt, RkCode = 1, Rest = 3, Result = 8 }, default);

        Assert.Equal(StatusCodes.Status502BadGateway, Assert.IsType<ObjectResult>(result.Result).StatusCode);
    }

    [Fact]
    public async Task Block_CreatesStoreBlockForTodayAndLogsIt_UnblockDisablesIt()
    {
        using var env = CreateEnv();

        var block = OkValue(await env.Controller.Block("bakery", new() { Tt = Tt, RkCode = 1, Rest = 4 }, default));

        Assert.Equal(("soft", true, "Заблокировал(а) Розница Невский 96 в 10:05"), (block.Kind, block.CanUnlock, block.Text));
        var stored = env.Calc.ItemBlocks.AsNoTracking().Single(x => x.ItemRkCode == 1);
        Assert.Equal((Tt, 1, true, Thursday.Date, Thursday.Date.AddDays(1)), (stored.TTCode, stored.Type, stored.Enable, stored.Begin, stored.End));
        Assert.Equal((4, -1), (env.Sink.Sent.Single().Rest, env.Sink.Sent.Single().Result));

        Assert.IsType<NoContentResult>(await env.Controller.Unblock("bakery", Tt, 1, default));
        stored = env.Calc.ItemBlocks.AsNoTracking().Single(x => x.ItemRkCode == 1);
        Assert.False(stored.Enable);
        Assert.Contains("Удалил: Розница Невский 96", stored.Info);
    }

    [Fact]
    public async Task Unblock_RefusesTechnologistBlock()
    {
        using var env = CreateEnv();

        Assert.IsType<NotFoundObjectResult>(await env.Controller.Unblock("bakery", Tt, 2, default));
        Assert.True(env.Calc.ItemBlocks.AsNoTracking().Single(x => x.Id == 1).Enable);
    }

    [Fact]
    public void Windows_ResolveCurrentAndNextIncludingTomorrow_AndStoreOverrides()
    {
        EntryWindow[] windows = [new(330, 450), new(570, 720)];

        var inside = CalculatorWindows.Resolve(windows, Thursday);
        Assert.Equal((windows[1], Thursday.Date.AddMinutes(570)), (inside.Current, inside.CurrentStart));

        var evening = CalculatorWindows.Resolve(windows, Thursday.Date.AddHours(20));
        Assert.Null(evening.Current);
        Assert.Equal(Thursday.Date.AddDays(1).AddMinutes(330), evening.NextStart);

        // конец окна не включается
        Assert.Null(CalculatorWindows.Resolve(windows, Thursday.Date.AddMinutes(450)).Current);

        var rows = new[]
        {
            new OfficeCalculatorEntryWindow { Category = "bread", StartMinute = 330, EndMinute = 450 },
            new OfficeCalculatorEntryWindow { Category = "bread", TTCode = 7, StartMinute = 120, EndMinute = 270 },
        };
        Assert.Equal([new EntryWindow(120, 270)], CalculatorWindows.For(rows, "bread", 7));
        Assert.Equal([new EntryWindow(330, 450)], CalculatorWindows.For(rows, "bread", 8));
    }

    [Fact]
    public void DefaultWindows_DoNotOverlapAndCoverEveryCategoryForAllStores()
    {
        var defaults = CalculatorWindowsInitializer.Defaults();

        Assert.Equal(CalculatorCategories.All.Select(x => x.Slug).OrderBy(x => x), defaults.Where(x => x.TTCode == null).Select(x => x.Category).Distinct().OrderBy(x => x));
        foreach (var set in defaults.GroupBy(x => (x.Category, x.TTCode)))
        {
            var ordered = set.OrderBy(x => x.StartMinute).ToList();
            Assert.All(ordered, x => Assert.True(x.StartMinute < x.EndMinute));
            for (var i = 1; i < ordered.Count; i++)
                Assert.True(ordered[i].StartMinute >= ordered[i - 1].EndMinute);
        }
    }
}
