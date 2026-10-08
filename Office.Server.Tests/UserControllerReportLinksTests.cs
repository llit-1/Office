using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Nx;
using Office.Server.Reports;
using Xunit;

namespace Office.Server.Tests;

public class UserControllerReportLinksTests
{
    private const int UserId = 5;

    private static (UserController Controller, RKNETDBContext Db) Create()
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.OfficeUser.Add(new OfficeUser { Id = UserId, Login = "petrov", Surname = "Петров", Name = "Пётр", Actual = 1 });
        db.SaveChanges();

        var controller = new UserController(db, CreateNxUserSync(db))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.Name, "admin")], "Test")),
                },
            },
        };

        return (controller, db);
    }

    /// <summary>Nx не настроен: в этих тестах доступы не меняются, синхронизация не вызывается.</summary>
    private static NxUserSyncService CreateNxUserSync(RKNETDBContext db) => new(
        new NxRestClient(new UnusedHttpClientFactory(), new ConfigurationBuilder().Build()),
        db,
        NullLogger<NxUserSyncService>.Instance);

    private sealed class UnusedHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => throw new InvalidOperationException("NX не должен вызываться в этом тесте.");
    }

    private static UserController.OfficeUserUpdateModel Model(UserController.UserReportLinksModel? links, string name = "Пётр") => new()
    {
        Id = UserId,
        Login = "petrov",
        Surname = "Петров",
        Name = name,
        Actual = 1,
        ReportLinks = links,
    };

    [Fact]
    public async Task SavesPersonalLinksTogetherWithUserAndReturnsThemInCard()
    {
        var (controller, db) = Create();
        using var _ = db;

        var result = await controller.UpdateUser(Model(new() { Profit = " https://powerbi.test/profit ", ProfitPro = "" }));

        Assert.IsType<OkObjectResult>(result);
        var row = Assert.Single(db.OfficeReportSettings);
        Assert.Equal(ReportCatalog.Profit, row.ReportCode);
        Assert.Equal(UserId, row.OfficeUserId);
        Assert.Equal("https://powerbi.test/profit", row.Value);
        Assert.Equal("admin", row.UpdatedBy);

        var card = (await controller.GetUserById(UserId)).Value!;
        Assert.Equal("https://powerbi.test/profit", card.ReportLinks.Profit);
        Assert.Null(card.ReportLinks.ProfitPro);
    }

    [Fact]
    public async Task RejectsLinkThatCannotBeEmbeddedWithoutChangingUser()
    {
        var (controller, db) = Create();
        using var _ = db;

        var result = await controller.UpdateUser(Model(new() { ProfitPro = "http://powerbi.test/pro" }, name: "Иван"));

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Equal("Пётр", (await db.OfficeUser.AsNoTracking().SingleAsync()).Name);
        Assert.Empty(db.OfficeReportSettings);
    }

    [Fact]
    public async Task MissingLinksKeepExistingValuesAndEmptyLinksRemoveThem()
    {
        var (controller, db) = Create();
        using var _ = db;
        db.OfficeReportSettings.Add(new OfficeReportSetting
        {
            ReportCode = ReportCatalog.Profit,
            OfficeUserId = UserId,
            Value = "https://powerbi.test/profit",
            UpdatedAtUtc = DateTime.UtcNow,
        });
        await db.SaveChangesAsync();

        Assert.IsType<OkObjectResult>(await controller.UpdateUser(Model(links: null)));
        Assert.Single(db.OfficeReportSettings);

        Assert.IsType<OkObjectResult>(await controller.UpdateUser(Model(new() { Profit = "", ProfitPro = " " })));
        Assert.Empty(db.OfficeReportSettings);
    }
}
