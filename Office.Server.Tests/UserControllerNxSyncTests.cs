using System.Security.Claims;
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
/// Синхронизация доступов Nx при сохранении пользователя: Nx дёргается только когда меняются ТТ,
/// роль NX или активность, а ненастроенный Nx не мешает сохранить карточку.
/// </summary>
public class UserControllerNxSyncTests
{
    private const int UserId = 7;

    private static (UserController Controller, RKNETDBContext Db) Create(bool withNxRole = true)
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var user = new OfficeUser { Id = UserId, Login = "petrov", Surname = "Петров", Name = "Пётр", Actual = 1 };
        if (withNxRole)
            user.OfficeGroup.Add(new OfficeGroup { ID = 1, Name = "ТТ", OfficeRole = [new OfficeRole { Name = "NX", Role = "NX" }] });
        db.OfficeUser.Add(user);
        db.SaveChanges();

        var nxUserSync = new NxUserSyncService(
            new NxRestClient(new UnusedHttpClientFactory(), new ConfigurationBuilder().Build()),
            db,
            NullLogger<NxUserSyncService>.Instance);

        var controller = new UserController(db, nxUserSync)
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

    /// <summary>Клиент не создаётся: при ненастроенном Nx до HTTP дело не доходит.</summary>
    private sealed class UnusedHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => throw new InvalidOperationException("NX не должен вызываться в этом тесте.");
    }

    private static UserController.OfficeUserUpdateModel Model(int defaultLocations, string name = "Пётр", bool withNxRole = true) => new()
    {
        Id = UserId,
        Login = "petrov",
        Surname = "Петров",
        Name = name,
        Actual = 1,
        DefaultLocations = defaultLocations,
        OfficeGroup = withNxRole ? [1] : [],
    };

    [Fact]
    public async Task SavesUserAndReturnsWarningWhenNxIsNotConfigured()
    {
        var (controller, db) = Create();
        using var _ = db;

        var result = Assert.IsType<OkObjectResult>(await controller.UpdateUser(Model(defaultLocations: 1)));
        var warnings = result.Value?.GetType().GetProperty("nxWarnings")?.GetValue(result.Value) as List<string>;

        Assert.Equal(1, db.OfficeUser.Single(x => x.Id == UserId).DefaultLocations);
        Assert.Contains(warnings ?? [], warning => warning.Contains("NX не настроен"));
    }

    [Fact]
    public async Task SkipsNxWhenAccessSettingsAreUnchanged()
    {
        var (controller, db) = Create();
        using var _ = db;

        var result = Assert.IsType<OkObjectResult>(await controller.UpdateUser(Model(defaultLocations: 0, name: "Пётр Второй")));
        var warnings = result.Value?.GetType().GetProperty("nxWarnings")?.GetValue(result.Value) as List<string>;

        // the name comes from AD only: a name in the request is ignored
        Assert.Equal("Пётр", db.OfficeUser.Single(x => x.Id == UserId).Name);
        Assert.Empty(warnings ?? []);
    }

    [Fact]
    public async Task IgnoresNameAndPositionFromTheRequest()
    {
        var (controller, db) = Create();
        using var _ = db;
        var model = Model(defaultLocations: 0, name: "Чужое имя");
        model.Surname = "Чужая фамилия";
        model.Patronymic = "Чужое отчество";
        model.Position = "Чужая должность";

        Assert.IsType<OkObjectResult>(await controller.UpdateUser(model));

        var user = db.OfficeUser.Single(x => x.Id == UserId);
        Assert.Equal(("Петров", "Пётр", (string?)null, (string?)null), (user.Surname, user.Name, user.Patronymic, user.Position));
    }

    [Fact]
    public async Task SkipsNxForUserWithoutNxRoleEvenWhenPointsChange()
    {
        var (controller, db) = Create(withNxRole: false);
        using var _ = db;

        // An unconfigured Nx would answer with a warning if it were asked at all.
        var result = Assert.IsType<OkObjectResult>(await controller.UpdateUser(Model(defaultLocations: 1, withNxRole: false)));
        var warnings = result.Value?.GetType().GetProperty("nxWarnings")?.GetValue(result.Value) as List<string>;

        Assert.Equal(1, db.OfficeUser.Single(x => x.Id == UserId).DefaultLocations);
        Assert.Empty(warnings ?? []);
    }
}
