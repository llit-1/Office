using Microsoft.Extensions.Logging.Abstractions;
using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.Calculator;
using Office.Server.Controllers;
using Office.Server.DbContexts.Calculator;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Xunit;

namespace Office.Server.Tests;

public class CalculatorSettingsTests
{
    private static readonly Guid Bakery = CalculatorCategories.Find("bakery")!.Group;
    private static readonly Guid Bread = CalculatorCategories.Find("bread")!.Group;
    private static readonly Guid Morning = Guid.NewGuid();
    private static readonly Guid Evening = Guid.NewGuid();
    private static readonly DateTime Now = new(2026, 10, 16, 10, 5, 0);
    private const int Nevsky = 1023253;
    private const int Sadovaya = 1001420;

    private sealed record Env(RKNETDBContext Db, CalculatorDbContext Calc, CalculatorSettingsController Controller, FakeJobs Jobs) : IDisposable
    {
        public void Dispose()
        {
            Db.Dispose();
            Calc.Dispose();
        }
    }

    private static Env CreateEnv()
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.OfficeUser.Add(new OfficeUser("nikonova", "Виктория") { Id = 7, Surname = "Никонова", Actual = 1 });
        db.SaveChanges();

        var calc = new CalculatorDbContext(new DbContextOptionsBuilder<CalculatorDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        calc.TTs.AddRange(new CalcTT { TTCode = Nevsky, TTName = "Невский 96" }, new CalcTT { TTCode = Sadovaya, TTName = "Захарьевская 25" });
        calc.TimeGroups.AddRange(
            new CalcTimeGroup { Guid = Morning, Name = "Утро(Выпечные изделия)\n", FirstHour = 7, LastHour = 11, ItemsGroup = Bakery },
            new CalcTimeGroup { Guid = Evening, Name = "Вечер(Выпечные изделия)", FirstHour = 18, LastHour = 23, ItemsGroup = Bakery });
        calc.PeriodCoefficients.Add(new CalcPeriodCoefficient { TimeGroupGuid = Morning, TTCode = Nevsky, Coefficient = 1.5, Name = "Невский 96 Утро(Выпечные изделия)" });
        calc.Items.AddRange(
            new CalcItem { RkCode = 1, Name = "Круассан", ItemsGroup = Bakery, Coefficient = 1.15, ReplacementGroupId = 16 },
            new CalcItem { RkCode = 2, Name = "Улитка", ItemsGroup = Bakery, Coefficient = 1.15 },
            new CalcItem { RkCode = 3, Name = "Багет", ItemsGroup = Bread, Coefficient = 1.1 });
        calc.ItemOnTT.Add(new CalcItemOnTT { Guid = Guid.NewGuid(), Name = "Невский 96 Круассан", TTCode = Nevsky, ItemRkCode = 1, Coefficient = 1 });
        calc.ReplacementGroups.AddRange(new CalcReplacementGroup { Id = 16, Name = "Слойки сладкие" }, new CalcReplacementGroup { Id = 17, Name = "Пустая" });
        calc.DayGroups.Add(new CalcDayGroup { Guid = Guid.NewGuid(), Name = "Вс", FirstDay = 7, LastDay = 7 });
        calc.SaveChanges();
        db.ChangeTracker.Clear();
        calc.ChangeTracker.Clear();

        var identity = new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, "7"), new Claim(ClaimTypes.Role, CalculatorRoles.Admin)], "Test");
        var jobs = new FakeJobs();
        var controller = new CalculatorSettingsController(db, calc, jobs, NullLogger<CalculatorSettingsController>.Instance)
        {
            Now = () => Now,
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) } },
        };
        return new Env(db, calc, controller, jobs);
    }

    private static T OkValue<T>(ActionResult<T> result) => Assert.IsType<T>(Assert.IsType<OkObjectResult>(result.Result).Value);

    private sealed class FakeJobs : ICalculatorDeferredJobs
    {
        public List<(string Task, DeferredChange Change, DateTime When)> Scheduled { get; } = [];
        public List<string> Deleted { get; } = [];

        public Task ScheduleAsync(string task, DeferredChange change, DateTime when, CancellationToken ct = default)
        {
            Scheduled.Add((task, change, when));
            return Task.CompletedTask;
        }

        public Task DeleteAsync(string task, CancellationToken ct = default)
        {
            Deleted.Add(task);
            return Task.CompletedTask;
        }
    }

    [Fact]
    public async Task DeferredChange_LeavesCoefficientsAloneAndGoesToSqlAgentJob()
    {
        using var env = CreateEnv();
        var when = Now.AddDays(1).AddHours(2);

        Assert.IsType<OkObjectResult>(await env.Controller.ApplyCoefficients(new()
        {
            Kind = "sku",
            Category = "bakery",
            Op = "multiply",
            Value = 1.5,
            Cells = [new() { Key = "1" }],
            DeferredExecution = when,
        }, default));

        Assert.Equal(1.15, env.Calc.Items.AsNoTracking().Single(x => x.RkCode == 1).Coefficient);
        var job = Assert.Single(env.Jobs.Scheduled);
        Assert.Equal(("Items", "COEFFICIENT * (1.5)", when), (job.Change.Table, job.Change.Assign, job.When));
        Assert.Equal(["RKCODE = 1"], job.Change.Conditions);
        var log = Assert.Single(env.Db.CalculatorCoefficientLogs.AsNoTracking());
        Assert.Equal((0, job.Task, when, 1.725), (log.Status, log.Task, log.TaskExecution, log.K2));

        var task = Assert.Single(OkValue(await env.Controller.GetCoefficientTasks(default)));
        Assert.Equal((job.Task, when, 1, false), (task.Task, task.Execution, task.Count, task.Overdue));
        var row = Assert.Single(OkValue(await env.Controller.GetCoefficientTask(job.Task, default)));
        Assert.Equal(("K2", 1.725), (row.Kind, row.Value));

        Assert.IsType<NoContentResult>(await env.Controller.DeleteCoefficientTask(job.Task, default));
        Assert.Equal([job.Task], env.Jobs.Deleted);
        Assert.Empty(env.Db.CalculatorCoefficientLogs.AsNoTracking());
    }

    [Fact]
    public async Task DeferredChange_RejectsPastTimeAndUnknownTask()
    {
        using var env = CreateEnv();

        Assert.IsType<BadRequestObjectResult>(await env.Controller.ApplyCoefficients(new()
        {
            Kind = "sku",
            Category = "bakery",
            Op = "set",
            Value = 1,
            Cells = [new() { Key = "1" }],
            DeferredExecution = Now.AddMinutes(-1),
        }, default));
        Assert.Empty(env.Jobs.Scheduled);

        Assert.IsType<NotFoundObjectResult>(await env.Controller.DeleteCoefficientTask("1'; drop table x", default));
        Assert.Empty(env.Jobs.Deleted);
    }

    [Fact]
    public void DeferredJobSql_MatchesLegacyJobAndMarksJournal()
    {
        var change = new DeferredChange("ItemsGroupTimeTT_COEFFICIENT", "COEFFICIENT + (0.1)", ["(TTCODE = 7 and TIMEGROUPGUID = ''abc'')", "(TTCODE = 8 and TIMEGROUPGUID = ''abc'')"]);

        var sql = SqlAgentDeferredJobs.BuildSql("123", change, new DateTime(2026, 11, 3, 5, 7, 9));

        Assert.Contains("msdb.dbo.sp_add_job @job_name = N'123'", sql);
        Assert.Contains("N'Use Calculator Update ItemsGroupTimeTT_COEFFICIENT Set COEFFICIENT = COEFFICIENT + (0.1) Where (TTCODE = 7 and TIMEGROUPGUID = ''abc'') or (TTCODE = 8 and TIMEGROUPGUID = ''abc''); USE RKNET Update Calculator\u0421oefficientLogs Set Status = 1 where Task = ''123''; Exec msdb.dbo.sp_delete_job @job_name = N''123'';'", sql);
        Assert.Contains("@active_start_date = 20261103, @active_start_time = 050709", sql);
        Assert.Contains("sp_add_jobserver @job_name = N'123'", sql);
    }

    [Fact]
    public async Task PeriodGrid_ShowsStoresByPeriodsWithMissingCellsAbsent()
    {
        using var env = CreateEnv();

        var grid = OkValue(await env.Controller.GetCoefficients("period", "bakery", default));

        Assert.Equal(["Утро · 7–12", "Вечер · 18–24"], grid.Columns.Select(x => x.Title));
        Assert.Equal(["Захарьевская 25", "Невский 96"], grid.Rows.Select(x => x.Name));
        Assert.Equal(1.5, grid.Rows[1].Values[Morning.ToString()]);
        Assert.False(grid.Rows[1].Values.ContainsKey(Evening.ToString()));
    }

    [Fact]
    public async Task ApplyPeriod_SetsAddsMultipliesAndWritesJournal()
    {
        using var env = CreateEnv();
        var cells = new List<CalculatorSettingsController.CoefficientCellDto>
        {
            new() { Tt = Nevsky, Key = Morning.ToString() },
            new() { Tt = Nevsky, Key = Evening.ToString() },
        };

        // «равно» создаёт недостающий коэффициент
        Assert.IsType<OkObjectResult>(await env.Controller.ApplyCoefficients(new() { Kind = "period", Category = "bakery", Cells = cells, Op = "set", Value = 1.2 }, default));
        Assert.IsType<OkObjectResult>(await env.Controller.ApplyCoefficients(new() { Kind = "period", Category = "bakery", Cells = cells, Op = "multiply", Value = 1.5 }, default));
        Assert.IsType<OkObjectResult>(await env.Controller.ApplyCoefficients(new() { Kind = "period", Category = "bakery", Cells = cells[..1], Op = "add", Value = -0.3 }, default));

        var values = env.Calc.PeriodCoefficients.AsNoTracking().Where(x => x.TTCode == Nevsky).ToDictionary(x => x.TimeGroupGuid, x => x.Coefficient);
        Assert.Equal(1.5, values[Morning], 6);
        Assert.Equal(1.8, values[Evening], 6);
        Assert.Equal("Невский 96 Вечер(Выпечные изделия)", env.Calc.PeriodCoefficients.AsNoTracking().Single(x => x.TimeGroupGuid == Evening).Name);

        var journal = env.Db.CalculatorCoefficientLogs.AsNoTracking().OrderBy(x => x.Id).ToList();
        Assert.Equal(5, journal.Count);
        Assert.All(journal, x => Assert.Equal(("Никонова Виктория", 2, Now), (x.Orderer, x.Status, x.TaskExecution)));
        Assert.Equal((1.5, Nevsky, Morning), (journal[^1].K3!.Value, journal[^1].TT!.Value, journal[^1].TimeGroup!.Value));
    }

    [Fact]
    public async Task Apply_RejectsOutOfRangeResultAndSavesNothing()
    {
        using var env = CreateEnv();

        var result = await env.Controller.ApplyCoefficients(new()
        {
            Kind = "period", Category = "bakery", Op = "add", Value = -2,
            Cells = [new() { Tt = Nevsky, Key = Morning.ToString() }],
        }, default);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal(1.5, env.Calc.PeriodCoefficients.AsNoTracking().Single().Coefficient);
        Assert.Empty(env.Db.CalculatorCoefficientLogs);
    }

    [Fact]
    public async Task ApplyItem_ChangesOnlyExistingItemsOnStores()
    {
        using var env = CreateEnv();

        var result = await env.Controller.ApplyCoefficients(new()
        {
            Kind = "item", Category = "bakery", Op = "set", Value = 0.8,
            Cells = [new() { Tt = Nevsky, Key = "1" }, new() { Tt = Sadovaya, Key = "1" }, new() { Tt = Nevsky, Key = "3" }],
        }, default);

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal(0.8, env.Calc.ItemOnTT.AsNoTracking().Single().Coefficient);
        var entry = Assert.Single(env.Db.CalculatorCoefficientLogs);
        Assert.Equal((0.8, 1, Nevsky), (entry.K1!.Value, entry.SKU!.Value, entry.TT!.Value));
    }

    [Fact]
    public async Task ApplySku_ChangesItemCoefficientForAllStores()
    {
        using var env = CreateEnv();

        Assert.IsType<OkObjectResult>(await env.Controller.ApplyCoefficients(new() { Kind = "sku", Category = "bakery", Op = "add", Value = 0.05, Cells = [new() { Key = "1" }, new() { Key = "3" }] }, default));

        Assert.Equal(1.2, env.Calc.Items.AsNoTracking().Single(x => x.RkCode == 1).Coefficient, 6);
        // багет из другой категории не тронут
        Assert.Equal(1.1, env.Calc.Items.AsNoTracking().Single(x => x.RkCode == 3).Coefficient, 6);
        Assert.Equal((1.2, 1), (env.Db.CalculatorCoefficientLogs.Single().K2!.Value, env.Db.CalculatorCoefficientLogs.Single().SKU!.Value));
    }

    [Fact]
    public async Task SaveWindows_ReplacesSetAndRejectsOverlaps()
    {
        using var env = CreateEnv();
        env.Db.OfficeCalculatorEntryWindows.Add(new OfficeCalculatorEntryWindow { Category = "bakery", StartMinute = 330, EndMinute = 450 });
        env.Db.SaveChanges();

        Assert.IsType<BadRequestObjectResult>(await env.Controller.SaveWindows(new() { Category = "bakery", Windows = [new() { Start = 330, End = 600 }, new() { Start = 570, End = 720 }] }, default));
        Assert.IsType<BadRequestObjectResult>(await env.Controller.SaveWindows(new() { Category = "bakery", Windows = [] }, default));

        Assert.IsType<NoContentResult>(await env.Controller.SaveWindows(new() { Category = "bakery", Windows = [new() { Start = 570, End = 720 }, new() { Start = 300, End = 420 }] }, default));
        Assert.IsType<NoContentResult>(await env.Controller.SaveWindows(new() { Category = "bakery", Tt = Nevsky, Windows = [new() { Start = 120, End = 270 }] }, default));

        var windows = OkValue(await env.Controller.GetWindows(default));
        Assert.Equal([("bakery", (int?)null, 300, 420), ("bakery", null, 570, 720), ("bakery", Nevsky, 120, 270)], windows.Select(x => (x.Category, x.Tt, x.Start, x.End)));

        // пустой список для точки — вернуть общие окна
        Assert.IsType<NoContentResult>(await env.Controller.SaveWindows(new() { Category = "bakery", Tt = Nevsky, Windows = [] }, default));
        Assert.DoesNotContain(OkValue(await env.Controller.GetWindows(default)), x => x.Tt == Nevsky);
    }

    [Fact]
    public async Task SaveItem_CreatesAndMovingToOtherCategoryLeavesReplacementGroup()
    {
        using var env = CreateEnv();

        var created = OkValue(await env.Controller.SaveItem(new() { RkCode = 9, Name = " Слойка ", Category = "bakery", Coefficient = 1.2, MinShowCase = 3, DefrostMinutes = 40, BakingMode = "p1" }, default));
        Assert.Equal(("Слойка", "bakery", 40, "P1"), (created.Name, created.Category, created.DefrostMinutes, created.BakingMode));

        OkValue(await env.Controller.SaveItem(new() { RkCode = 1, Name = "Круассан", Category = "bread", Coefficient = 1.1 }, default));
        var moved = env.Calc.Items.AsNoTracking().Single(x => x.RkCode == 1);
        Assert.Equal((Bread, (int?)null), (moved.ItemsGroup, moved.ReplacementGroupId));
    }

    [Fact]
    public async Task Groups_HoldItemsOfOneCategoryAndDeleteOnlyWhenEmpty()
    {
        using var env = CreateEnv();

        Assert.IsType<BadRequestObjectResult>(await env.Controller.SetGroupItems(16, new() { Items = [1, 3] }, default));
        Assert.IsType<NoContentResult>(await env.Controller.SetGroupItems(16, new() { Items = [2] }, default));
        Assert.Equal([2], env.Calc.Items.AsNoTracking().Where(x => x.ReplacementGroupId == 16).Select(x => x.RkCode));

        Assert.IsType<ConflictObjectResult>(await env.Controller.DeleteGroup(16, default));
        Assert.IsType<NoContentResult>(await env.Controller.DeleteGroup(17, default));
    }

    [Fact]
    public async Task SpecialDays_OnePerDate()
    {
        using var env = CreateEnv();
        var sunday = env.Calc.DayGroups.AsNoTracking().Single().Guid;

        OkValue(await env.Controller.SaveSpecialDay(new() { Date = new DateTime(2026, 12, 31), DayGroup = sunday }, default));

        Assert.IsType<ConflictObjectResult>((await env.Controller.SaveSpecialDay(new() { Date = new DateTime(2026, 12, 31), DayGroup = sunday }, default)).Result);
    }

    [Fact]
    public async Task Replacement_IsEitherItemOrStoreAndStoresInclusiveEnd()
    {
        using var env = CreateEnv();

        Assert.IsType<BadRequestObjectResult>((await env.Controller.SaveReplacement(new() { ItemCode = 1, ReplacementItemCode = 2, Tt = Nevsky, ReplacementTt = Sadovaya, From = Now, To = Now }, default)).Result);
        Assert.IsType<BadRequestObjectResult>((await env.Controller.SaveReplacement(new() { ItemCode = 1, ReplacementItemCode = 3, From = Now, To = Now }, default)).Result);

        var saved = OkValue(await env.Controller.SaveReplacement(new() { ItemCode = 1, ReplacementItemCode = 2, From = new DateTime(2026, 10, 16), To = new DateTime(2026, 10, 20) }, default));

        Assert.Equal(new DateTime(2026, 10, 20), saved.To);
        // расчёт считает замену действующей, пока End > сейчас: последний день — 20-е
        Assert.Equal(new DateTime(2026, 10, 21), env.Calc.Replacements.AsNoTracking().Single().End);
    }

    [Fact]
    public async Task Blocks_SaveWithAuthorAndRemoveKeepsHistory()
    {
        using var env = CreateEnv();

        var block = OkValue(await env.Controller.SaveBlock(new() { RkCode = 1, Tt = null, From = new DateTime(2026, 10, 16), To = new DateTime(2026, 10, 20), Type = 2 }, default));

        var stored = env.Calc.ItemBlocks.AsNoTracking().Single();
        Assert.Equal((new DateTime(2026, 10, 21), true, 2), (stored.End, stored.Enable, stored.Type));
        Assert.StartsWith("Заполнил: Никонова Виктория 16.10.2026", stored.Info);

        Assert.IsType<NoContentResult>(await env.Controller.DeleteBlock(block.Id, default));
        stored = env.Calc.ItemBlocks.AsNoTracking().Single();
        Assert.False(stored.Enable);
        Assert.Contains("Удалил: Никонова Виктория", stored.Info);
        Assert.Single(OkValue(await env.Controller.GetBlocks(default)));
    }
}
