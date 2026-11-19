using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Nx;
using Xunit;

namespace Office.Server.Tests;

/// <summary>
/// Открытие списка пользователей выключает на портале учётки, отключённые или удалённые в AD,
/// и никого не трогает, когда AD не ответил.
/// </summary>
public class UserControllerAdDeactivationTests
{
    private sealed class Controller(RKNETDBContext db, Func<IReadOnlyCollection<string>, IReadOnlyDictionary<string, UserController.AdAccount>?> directory)
        : UserController(db, new NxUserSyncService(
            new NxRestClient(new UnusedHttpClientFactory(), new ConfigurationBuilder().Build()), db, NullLogger<NxUserSyncService>.Instance))
    {
        public IReadOnlyCollection<string>? Asked { get; private set; }

        protected override IReadOnlyDictionary<string, AdAccount>? LoadAdAccounts(IReadOnlyCollection<string> logins)
        {
            Asked = logins;
            return directory(logins);
        }
    }

    private sealed class UnusedHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => throw new InvalidOperationException("NX не настроен в тесте.");
    }

    private static RKNETDBContext Db()
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.OfficeUser.AddRange(
            new OfficeUser { Id = 1, Login = "ivanova", Actual = 1 },
            new OfficeUser { Id = 2, Login = "fired", Actual = 1 },
            new OfficeUser { Id = 3, Login = "deleted", Actual = 1 },
            new OfficeUser { Id = 4, Login = "waiting", Actual = 0 },
            new OfficeUser { Id = 5, Login = "Legacy@shzhleb.ru", Actual = 1 });
        db.SaveChanges();
        return db;
    }

    private static UserController.AdAccount Enabled() => new(true, null, null, null, null);

    private static UserController.AdAccount Disabled() => new(false, null, null, null, null);

    private static Controller Create(RKNETDBContext db, Func<IReadOnlyCollection<string>, IReadOnlyDictionary<string, UserController.AdAccount>?> directory) =>
        new(db, directory) { ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() } };

    private static int Actual(RKNETDBContext db, int id) => db.OfficeUser.AsNoTracking().Single(x => x.Id == id).Actual;

    [Fact]
    public async Task DeactivatesUsersDisabledOrMissingInAd()
    {
        using var db = Db();
        var controller = Create(db, _ => new Dictionary<string, UserController.AdAccount>(StringComparer.OrdinalIgnoreCase)
        {
            ["IVANOVA"] = Enabled(),
            ["fired"] = Disabled(),
            ["legacy@shzhleb.ru"] = Enabled(),
        });

        var users = (await controller.GetAllUsers()).Value!.ToList();

        Assert.Equal(1, Actual(db, 1));
        Assert.Equal(0, Actual(db, 2));
        Assert.Equal(0, Actual(db, 3));
        Assert.Equal(1, Actual(db, 5));
        Assert.Equal(0, users.Single(x => x.Id == 2).Actual); // the list already shows the switch-off
        Assert.Equal(0, Actual(db, 4)); // a waiting account missing in AD stays as it is
    }

    [Fact]
    public async Task TakesNamesAndPositionFromAdForEveryAccountFoundThere()
    {
        using var db = Db();
        var waiting = db.OfficeUser.Single(x => x.Id == 4);
        waiting.Surname = "Абрамова 19";
        waiting.Name = "Розница";
        waiting.Patronymic = "Старое";
        waiting.Position = "Собственная пекарня";
        db.SaveChanges();
        var controller = Create(db, _ => new Dictionary<string, UserController.AdAccount>(StringComparer.OrdinalIgnoreCase)
        {
            ["ivanova"] = Enabled(),
            ["fired"] = Enabled(),
            ["deleted"] = Enabled(),
            ["legacy@shzhleb.ru"] = Enabled(),
            // the account that waits for activation is refreshed too; middleName is empty in AD
            ["waiting"] = new(true, " Розница ", "Абрамова 19", null, "Пекарня"),
        });

        var listed = (await controller.GetAllUsers()).Value!.Single(x => x.Id == 4);

        Assert.Equal(("Розница", "Абрамова 19", (string?)null, "Пекарня"), (listed.Surname, listed.Name, listed.Patronymic, listed.Position));
        Assert.Contains("waiting", controller.Asked!);
    }

    [Fact]
    public async Task ListCarriesGroupsAndPointsForTheCounts()
    {
        using var db = Db();
        var group = new OfficeGroup { Name = "ТТ" };
        var location = new Location { Guid = Guid.NewGuid(), Name = "Невский 35", Actual = 1 };
        db.AddRange(group, location);
        var user = db.OfficeUser.Single(x => x.Id == 1);
        user.OfficeGroup.Add(group);
        user.Locations.Add(location);
        db.SaveChanges();

        var users = (await Create(db, _ => null).GetAllUsers()).Value!.ToList();

        var listed = users.Single(x => x.Id == 1);
        Assert.Single(listed.OfficeGroup);
        Assert.Single(listed.Locations);
    }

    [Fact]
    public async Task TouchesNobodyWhenAdIsUnavailable()
    {
        using var db = Db();
        await Create(db, _ => null).GetAllUsers();

        Assert.All(new[] { 1, 2, 3, 5 }, id => Assert.Equal(1, Actual(db, id)));
    }

    [Fact]
    public async Task TouchesNobodyWhenAdFindsNoOneAtAll()
    {
        using var db = Db();
        await Create(db, _ => new Dictionary<string, UserController.AdAccount>()).GetAllUsers();

        Assert.All(new[] { 1, 2, 3, 5 }, id => Assert.Equal(1, Actual(db, id)));
    }
}
