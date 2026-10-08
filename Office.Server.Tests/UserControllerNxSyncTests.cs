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

    private static (UserController Controller, RKNETDBContext Db) Create()
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.OfficeUser.Add(new OfficeUser { Id = UserId, Login = "petrov", Surname = "Петров", Name = "Пётр", Actual = 1 });
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

    private static UserController.OfficeUserUpdateModel Model(int defaultLocations, string name = "Пётр") => new()
    {
        Id = UserId,
        Login = "petrov",
        Surname = "Петров",
        Name = name,
        Actual = 1,
        DefaultLocations = defaultLocations,
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

        Assert.Equal("Пётр Второй", db.OfficeUser.Single(x => x.Id == UserId).Name);
        Assert.Empty(warnings ?? []);
    }
}
