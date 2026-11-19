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
/// Роль NX, появившаяся или пропавшая в группе или роли, синхронизирует с Nx тех, у кого от этого
/// поменялся доступ к камерам. Nx в тестах не настроен: каждое обращение к нему видно по предупреждению
/// «NX не настроен», а HTTP не вызывается.
/// </summary>
public class UserControllerGroupNxSyncTests
{
    private const int CalculatorRoleId = 1;
    private const int NxRoleId = 2;
    private const int TtGroupId = 10;
    private const int CamerasGroupId = 11;

    private sealed class UnusedHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => throw new InvalidOperationException("NX не настроен в тесте.");
    }

    private static (UserController Controller, RKNETDBContext Db) Create()
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var calculator = new OfficeRole { ID = CalculatorRoleId, Name = "Калькулятор", Role = "Calculator" };
        var nx = new OfficeRole { ID = NxRoleId, Name = "NX - Видеонаблюдение", Role = "NX" };
        var tt = new OfficeGroup { ID = TtGroupId, Name = "ТТ", OfficeRole = [calculator] };
        var cameras = new OfficeGroup { ID = CamerasGroupId, Name = "Камеры", OfficeRole = [nx] };
        db.OfficeUser.AddRange(
            new OfficeUser { Id = 1, Login = "ll-active", Actual = 1, OfficeGroup = [tt] },
            new OfficeUser { Id = 2, Login = "ll-inactive", Actual = 0, OfficeGroup = [tt] },
            new OfficeUser { Id = 3, Login = "ll-hascameras", Actual = 1, OfficeGroup = [tt, cameras] });
        db.SaveChanges();

        var nxUserSync = new NxUserSyncService(
            new NxRestClient(new UnusedHttpClientFactory(), new ConfigurationBuilder().Build()), db, NullLogger<NxUserSyncService>.Instance);
        var controller = new UserController(db, nxUserSync)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        return (controller, db);
    }

    private static List<string> Warnings(IActionResult result)
    {
        var value = Assert.IsType<OkObjectResult>(result).Value!;
        return (List<string>)value.GetType().GetProperty("nxWarnings")!.GetValue(value)!;
    }

    private static OfficeGroup TtGroup(params int[] roleIds) => new()
    {
        ID = TtGroupId,
        Name = "ТТ",
        OfficeRole = roleIds.Select(id => new OfficeRole { ID = id }).ToList()
    };

    [Fact]
    public async Task AddingNxToGroupSyncsActiveMembersWhoGainCameras()
    {
        var (controller, db) = Create();
        using var _ = db;

        var warnings = Warnings(await controller.UpdateGroup(TtGroup(CalculatorRoleId, NxRoleId)));

        // only ll-active: ll-inactive is not active, ll-hascameras already had NX through another group
        Assert.Single(warnings);
        Assert.Contains("NX не настроен", warnings[0]);
    }

    [Fact]
    public async Task RemovingNxFromGroupSyncsMembersWhoLoseCameras()
    {
        var (controller, db) = Create();
        using var _ = db;
        await controller.UpdateGroup(TtGroup(CalculatorRoleId, NxRoleId));

        var warnings = Warnings(await controller.UpdateGroup(TtGroup(CalculatorRoleId)));

        Assert.Single(warnings);
    }

    [Fact]
    public async Task GroupEditWithoutNxChangeDoesNotTouchNx()
    {
        var (controller, db) = Create();
        using var _ = db;

        Assert.Empty(Warnings(await controller.UpdateGroup(new OfficeGroup
        {
            ID = TtGroupId,
            Name = "ТТ розница",
            OfficeRole = [new OfficeRole { ID = CalculatorRoleId }]
        })));
    }

    [Fact]
    public async Task RoleBecomingNxSyncsUsersWhoHaveIt()
    {
        var (controller, db) = Create();
        using var _ = db;

        var warnings = Warnings(await controller.UpdateRole(new OfficeRole
        {
            ID = CalculatorRoleId,
            Name = "Калькулятор",
            Role = "NX"
        }));

        Assert.Single(warnings); // ll-active; ll-hascameras had NX anyway, ll-inactive is not active
    }

    [Fact]
    public async Task RoleEditWithoutNxChangeDoesNotTouchNx()
    {
        var (controller, db) = Create();
        using var _ = db;

        Assert.Empty(Warnings(await controller.UpdateRole(new OfficeRole
        {
            ID = CalculatorRoleId,
            Name = "Калькулятор розницы",
            Role = "Calculator"
        })));
    }
}
