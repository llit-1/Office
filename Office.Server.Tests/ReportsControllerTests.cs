using System.Reflection;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Office.Server.DbContexts.RK7;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.DbContexts.Reports1C;
using Office.Server.Reports;
using Xunit;

namespace Office.Server.Tests;

public class ReportsControllerTests
{
    private const int UserId = 42;

    private sealed record Fixture(ReportsController Controller, RKNETDBContext Db, string Root) : IDisposable
    {
        public void Dispose()
        {
            Db.Dispose();
            if (Directory.Exists(Root))
            {
                Directory.Delete(Root, recursive: true);
            }
        }
    }

    private static DbContextOptions<T> InMemory<T>() where T : DbContext =>
        new DbContextOptionsBuilder<T>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options;

    private static Fixture Create(int defaultLocations, params string[] roles)
    {
        var db = new RKNETDBContext(InMemory<RKNETDBContext>());
        db.OfficeUser.Add(new OfficeUser { Id = UserId, Login = "ivanov", Surname = "Иванов", Name = "Иван", DefaultLocations = defaultLocations });
        db.SaveChanges();

        var builder = new FranchiseeReportBuilder(
            db,
            new Rk7Context(InMemory<Rk7Context>()),
            new Reports1CContext(InMemory<Reports1CContext>()),
            new ConfigurationBuilder().Build());

        var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, UserId.ToString()), new(ClaimTypes.Name, "ivanov") };
        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));

        var controller = new ReportsController(db, builder, new ReportFileTickets(), NullLogger<ReportsController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test")) },
            },
        };

        return new Fixture(controller, db, Path.Combine(Path.GetTempPath(), $"office-reports-{Guid.NewGuid():N}"));
    }

    private static void AddSetting(RKNETDBContext db, string code, string value, int? userId = null)
    {
        db.OfficeReportSettings.Add(new OfficeReportSetting { ReportCode = code, OfficeUserId = userId, Value = value, UpdatedAtUtc = DateTime.UtcNow });
        db.SaveChanges();
    }

    [Fact]
    public async Task CatalogContainsOnlyReportsAllowedByRoles()
    {
        using var fixture = Create(0, ReportRoles.Profit, ReportRoles.OneC);

        var catalog = (await fixture.Controller.GetCatalog(CancellationToken.None)).Value!;

        Assert.Equal(new[] { ReportCatalog.Profit, ReportCatalog.OneC }, catalog.Reports.Select(x => x.Code));
        Assert.False(catalog.Reports[0].Configured);
        Assert.Null(catalog.Reports[0].Url);
        Assert.StartsWith("http://", catalog.Reports[1].Url);
        Assert.False(catalog.CanManage);
    }

    [Theory]
    [InlineData(1, "https://powerbi.test/common")]
    [InlineData(0, "https://powerbi.test/personal")]
    public async Task ProfitLinkUsesCommonReportOnlyForUsersWithAllLocations(int defaultLocations, string expected)
    {
        using var fixture = Create(defaultLocations, ReportRoles.Profit);
        AddSetting(fixture.Db, ReportCatalog.Profit, "https://powerbi.test/common");
        AddSetting(fixture.Db, ReportCatalog.Profit, "https://powerbi.test/personal", UserId);

        var link = (await fixture.Controller.GetLink(ReportCatalog.Profit, CancellationToken.None)).Value!;

        Assert.Equal(expected, link.Url);
        Assert.Equal("Иванов Иван", Assert.Single(fixture.Db.LastUsers).User);
    }

    [Fact]
    public async Task ProfitLinkIsNotFoundWithoutPersonalLink()
    {
        using var fixture = Create(0, ReportRoles.Profit);
        AddSetting(fixture.Db, ReportCatalog.Profit, "https://powerbi.test/common");

        var result = await fixture.Controller.GetLink(ReportCatalog.Profit, CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Fact]
    public async Task CommonSettingsRequireHttpsForEmbeddedReportsAndClearEmptyValues()
    {
        using var fixture = Create(0, ReportRoles.Admin);

        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.UpdateCommonSetting(
            ReportCatalog.ServiceDesk, new ReportSettingUpdateRequest { Value = "http://powerbi.test/report" }, CancellationToken.None));
        Assert.IsType<NoContentResult>(await fixture.Controller.UpdateCommonSetting(
            ReportCatalog.ServiceDesk, new ReportSettingUpdateRequest { Value = " https://powerbi.test/report " }, CancellationToken.None));
        Assert.Equal("https://powerbi.test/report", Assert.Single(fixture.Db.OfficeReportSettings).Value);

        Assert.IsType<NoContentResult>(await fixture.Controller.UpdateCommonSetting(
            ReportCatalog.ServiceDesk, new ReportSettingUpdateRequest { Value = "" }, CancellationToken.None));
        Assert.Empty(fixture.Db.OfficeReportSettings);
    }

    [Fact]
    public async Task FranchiseeReportRejectsForeignLocationAndLongPeriod()
    {
        using var fixture = Create(0, ReportRoles.Franchisee);
        var own = new Location { Guid = Guid.NewGuid(), Name = "ТТ Своя", Actual = 1, RKCode = 5 };
        var foreign = new Location { Guid = Guid.NewGuid(), Name = "ТТ Чужая", Actual = 1, RKCode = 6 };
        fixture.Db.Locations.AddRange(own, foreign);
        fixture.Db.OfficeUser.Single().Locations.Add(own);
        await fixture.Db.SaveChangesAsync();

        var lookups = (await fixture.Controller.GetFranchiseeLookups(CancellationToken.None)).Value!;
        Assert.Equal(own.Guid, Assert.Single(lookups.Locations).Guid);

        var foreignResult = await fixture.Controller.GetFranchiseeReport(
            "sales", foreign.Guid, new DateOnly(2024, 3, 1), new DateOnly(2024, 3, 2), CancellationToken.None);
        Assert.IsType<NotFoundObjectResult>(foreignResult.Result);

        var longPeriod = await fixture.Controller.GetFranchiseeReport(
            "sales", own.Guid, new DateOnly(2024, 3, 1), new DateOnly(2024, 4, 11), CancellationToken.None);
        Assert.IsType<BadRequestObjectResult>(longPeriod.Result);
    }

    [Fact]
    public async Task OtherReportsDoNotLeaveConfiguredFolder()
    {
        using var fixture = Create(0, ReportRoles.Other);
        var root = Path.Combine(fixture.Root, "reports");
        Directory.CreateDirectory(Path.Combine(root, "Месяц"));
        await File.WriteAllTextAsync(Path.Combine(root, "Месяц", "Март.pdf"), "pdf");
        await File.WriteAllTextAsync(Path.Combine(root, "Итоги.pdf"), "pdf");
        await File.WriteAllTextAsync(Path.Combine(root, "script.exe"), "exe");
        await File.WriteAllTextAsync(Path.Combine(fixture.Root, "secret.pdf"), "secret");
        AddSetting(fixture.Db, ReportCatalog.Other, root);

        // Папки и файлы из них в разделе не показываются и не открываются.
        var files = (await fixture.Controller.BrowseFiles(CancellationToken.None)).Value!;
        Assert.Equal(new[] { "Итоги.pdf" }, files.Entries.Select(x => x.Name));

        Assert.IsType<NotFoundObjectResult>(await fixture.Controller.CreateFileTicket(
            new ReportFileTicketRequest { Path = "Месяц/Март.pdf" }, CancellationToken.None));
        Assert.IsType<NotFoundObjectResult>(await fixture.Controller.CreateFileTicket(
            new ReportFileTicketRequest { Path = "../secret.pdf" }, CancellationToken.None));
        Assert.IsType<OkObjectResult>(await fixture.Controller.CreateFileTicket(
            new ReportFileTicketRequest { Path = "Итоги.pdf" }, CancellationToken.None));
    }

    [Fact]
    public void SettingsRequireReportsAdminAndSectionRequiresAnyReportRole()
    {
        foreach (var method in new[]
        {
            nameof(ReportsController.GetSettings),
            nameof(ReportsController.UpdateCommonSetting),
        })
        {
            Assert.Equal(ReportRoles.Admin, typeof(ReportsController).GetMethod(method)!.GetCustomAttribute<AuthorizeAttribute>()!.Roles);
        }

        Assert.Equal(ReportRoles.Any, typeof(ReportsController).GetCustomAttribute<AuthorizeAttribute>()!.Roles);
        Assert.NotNull(typeof(ReportsController).GetMethod(nameof(ReportsController.GetFileContent))!.GetCustomAttribute<AllowAnonymousAttribute>());
    }
}
