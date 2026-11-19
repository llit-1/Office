using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Xunit;

namespace Office.Server.Tests;

public class UserAttentionControllerTests
{
    private static readonly DateTime Today = DateTime.Today;

    private static (RKNETDBContext Db, UserAttentionDto Result) Run(Action<RKNETDBContext> seed)
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        seed(db);
        db.SaveChanges();
        var result = new UserAttentionController(db).Get(CancellationToken.None).GetAwaiter().GetResult().Value!;
        return (db, result);
    }

    private static OfficeGroup Group(params string[] roles) =>
        new() { Name = string.Join(",", roles), OfficeRole = roles.Select(role => new OfficeRole { Name = role, Role = role }).ToList() };

    private static void LoggedIn(RKNETDBContext db, int userId, DateTime when) =>
        db.OfficeAuthLogs.Add(new OfficeAuthLog { OfficeUserId = userId, Login = "x", LoggedDate = when });

    [Fact]
    public void FlagsActiveAccountsThatCannotSeeAnything()
    {
        var location = new Location { Guid = Guid.NewGuid(), Name = "Невский 35", Actual = 1 };
        var (db, result) = Run(db =>
        {
            db.OfficeUser.AddRange(
                new OfficeUser { Id = 1, Login = "nogroups", Actual = 1 },
                new OfficeUser { Id = 2, Login = "nopoints", Actual = 1, OfficeGroup = [Group("Calculator", "KnowledgeLibrary")] },
                new OfficeUser { Id = 3, Login = "allpoints", Actual = 1, DefaultLocations = 1, OfficeGroup = [Group(" calculator ")] },
                new OfficeUser { Id = 4, Login = "haspoint", Actual = 1, OfficeGroup = [Group("NX")], Locations = [location] },
                new OfficeUser { Id = 5, Login = "office", Actual = 1, OfficeGroup = [Group("Users")] },
                new OfficeUser { Id = 6, Login = "inactive", Actual = 0 });
            foreach (var id in new[] { 1, 2, 3, 4, 5 }) LoggedIn(db, id, Today);
        });
        using (db)
        {
            Assert.Equal(
                [new UserAttentionReasonDto(1, "нет ни одной группы"), new UserAttentionReasonDto(2, "нет торговых точек")],
                result.NoAccess);
        }
    }

    [Fact]
    public void FlagsActiveAccountsUnusedForNinetyDays()
    {
        var (db, result) = Run(db =>
        {
            db.OfficeUser.AddRange(
                new OfficeUser { Id = 1, Login = "recent", Actual = 1, OfficeGroup = [Group("Users")] },
                new OfficeUser { Id = 2, Login = "old", Actual = 1, OfficeGroup = [Group("Users")] },
                new OfficeUser { Id = 3, Login = "never", Actual = 1, OfficeGroup = [Group("Users")] },
                new OfficeUser { Id = 4, Login = "inactive", Actual = 0 });
            LoggedIn(db, 1, Today.AddDays(-UserAttentionController.StaleDays + 1));
            LoggedIn(db, 2, Today.AddDays(-200));
            LoggedIn(db, 2, Today.AddDays(-UserAttentionController.StaleDays - 1)); // the latest login counts
        });
        using (db)
        {
            Assert.Equal(
                // «never» has not signed in at all and is not counted
                [new UserAttentionReasonDto(2, $"последний вход {Today.AddDays(-UserAttentionController.StaleDays - 1):dd.MM.yyyy}")],
                result.Stale);
        }
    }

    [Fact]
    public void OnlyUsersSectionSeesIt() =>
        Assert.Equal("Users", typeof(UserAttentionController).GetCustomAttribute<AuthorizeAttribute>()!.Roles);
}
