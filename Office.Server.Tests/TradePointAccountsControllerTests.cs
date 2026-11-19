using System.Reflection;
using System.Runtime.InteropServices;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Xunit;

namespace Office.Server.Tests;

public class TradePointAccountsControllerTests
{
    private sealed class Controller(RKNETDBContext db, Func<IReadOnlyList<TradePointDirectoryAccount>> directory)
        : TradePointAccountsController(db, new MemoryCache(new MemoryCacheOptions()), new ConfigurationBuilder().Build(),
            NullLogger<TradePointAccountsController>.Instance)
    {
        protected override IReadOnlyList<TradePointDirectoryAccount> LoadDirectoryAccounts() => directory();
    }

    private static RKNETDBContext Db(params OfficeUser[] users)
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.OfficeUser.AddRange(users);
        db.SaveChanges();
        return db;
    }

    [Theory]
    [InlineData("Розница", "Чкаловский 23", null, "Пекарня", 0)]
    [InlineData("Абрамова 19", "Розница", null, "Пекарня", 2)] // swapped
    [InlineData("Пулковская", "14", null, "Пекарня", 1)]
    [InlineData("Розница", "Энгельса 111", null, "Собственная пекарня", 1)]
    [InlineData("Розница", "Невский 1", "Петрович", "Пекарня", 1)]
    [InlineData(null, "Ветеранов 169к4", null, null, 2)]
    public void ChecksTheAgreedFormat(string? surname, string? name, string? patronymic, string? position, int issues)
    {
        var account = new TradePointDirectoryAccount("ll-test", surname, name, patronymic, position);
        Assert.Equal(issues, TradePointAccountsController.Check(account).Count);
    }

    [Fact]
    public async Task ReportsOnlyPortalUsersFromTheRetailOuWithIssues()
    {
        using var db = Db(
            new OfficeUser { Id = 1, Login = "LL-Engelsa111" },
            new OfficeUser { Id = 2, Login = "ll-chkalovskii23" },
            new OfficeUser { Id = 3, Login = "AABogachev", Surname = "Богачев", Position = "Территориальный менеджер" });
        var controller = new Controller(db, () =>
        [
            new("ll-engelsa111", "Розница", "Энгельса 111", null, "собственная пекарня"),
            new("ll-chkalovskii23", "Розница", "Чкаловский 23", null, "Пекарня"),
            new("ll-not-on-portal", "Пулковская", "14", null, "Пекарня"),
        ]);

        var result = (await controller.GetIssues(CancellationToken.None)).Value!;

        var issue = Assert.Single(result);
        Assert.Equal(1, issue.UserId);
        Assert.Equal("должность «собственная пекарня» вместо «Пекарня»", Assert.Single(issue.Issues));
    }

    [Fact]
    public async Task UnavailableDirectoryIs503()
    {
        using var db = Db();
        var controller = new Controller(db, () => throw new COMException("The server is not operational."));

        var result = await controller.GetIssues(CancellationToken.None);

        Assert.Equal(503, Assert.IsType<ObjectResult>(result.Result).StatusCode);
    }

    [Fact]
    public void OnlyUsersSectionSeesIt() =>
        Assert.Equal("Users", typeof(TradePointAccountsController).GetCustomAttribute<AuthorizeAttribute>()!.Roles);
}
