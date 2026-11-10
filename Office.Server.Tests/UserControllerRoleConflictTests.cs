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
/// Взаимоисключающие роли: из ролей с одним ExclusiveKey группе, а пользователю — по всем его группам,
/// можно дать только одну. Проверяются сохранение группы, пользователя и смена ключа у роли.
/// </summary>
public class UserControllerRoleConflictTests
{
    private const int OrdersAdmin = 1;
    private const int OrdersAll = 2;
    private const int OrdersOwn = 3;
    private const int Reports = 4;

    private const int AdminsGroup = 10;
    private const int ShopsGroup = 11;
    private const int ReportsGroup = 12;

    private const int Manager = 7;
    private const int Retired = 8;

    private static (UserController Controller, RKNETDBContext Db) Create()
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

        var ordersAdmin = new OfficeRole { ID = OrdersAdmin, Name = "Заказы ТТ Админ", Role = "OrdersTTAdmin", Section = "Заказы ТТ", ExclusiveKey = "orders" };
        var ordersAll = new OfficeRole { ID = OrdersAll, Name = "Заказы - Все позиции", Role = "Order_man", Section = "Заказы ТТ", ExclusiveKey = "orders" };
        var ordersOwn = new OfficeRole { ID = OrdersOwn, Name = "Заказы - Собственное управление", Role = "Order_woman", Section = "Заказы ТТ", ExclusiveKey = "orders" };
        var reports = new OfficeRole { ID = Reports, Name = "Отчёты - Выручка", Role = "ReportsProfit", Section = "Отчёты" };
        db.OfficeRole.AddRange(ordersAdmin, ordersAll, ordersOwn, reports);

        var admins = new OfficeGroup { ID = AdminsGroup, Name = "Офис" };
        admins.OfficeRole.Add(ordersAdmin);
        var shops = new OfficeGroup { ID = ShopsGroup, Name = "Управляющие ТТ" };
        shops.OfficeRole.Add(ordersOwn);
        var reportsGroup = new OfficeGroup { ID = ReportsGroup, Name = "Аналитики" };
        reportsGroup.OfficeRole.Add(reports);
        db.OfficeGroup.AddRange(admins, shops, reportsGroup);

        // у управляющего — заказы своей ТТ и отчёты; уволенный сотрудник состоит в «Офисе»
        var manager = new OfficeUser { Id = Manager, Login = "petrov", Actual = 1 };
        manager.OfficeGroup.Add(shops);
        manager.OfficeGroup.Add(reportsGroup);
        var retired = new OfficeUser { Id = Retired, Login = "ivanov", Actual = 0 };
        retired.OfficeGroup.Add(admins);
        retired.OfficeGroup.Add(reportsGroup);
        db.OfficeUser.AddRange(manager, retired);
        db.SaveChanges();
        db.ChangeTracker.Clear();

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

    private sealed class UnusedHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => throw new InvalidOperationException("NX не должен вызываться в этом тесте.");
    }

    private static OfficeGroup Group(int id, string name, params int[] roleIds) => new()
    {
        ID = id,
        Name = name,
        OfficeRole = roleIds.Select(roleId => new OfficeRole { ID = roleId }).ToList(),
    };

    private static UserController.OfficeUserUpdateModel UserModel(params int[] groupIds) => new()
    {
        Id = Manager,
        Login = "petrov",
        Actual = 1,
        OfficeGroup = groupIds.ToList(),
    };

    private static string Message(IActionResult result) =>
        Assert.IsType<string>(Assert.IsType<BadRequestObjectResult>(result).Value!.GetType().GetProperty("message")!.GetValue(((BadRequestObjectResult)result).Value));

    private static int[] RoleIdsOf(RKNETDBContext db, int groupId) =>
        db.OfficeGroup.AsNoTracking().Include(g => g.OfficeRole).Single(g => g.ID == groupId).OfficeRole.Select(r => r.ID).Order().ToArray();

    [Fact]
    public async Task UpdateGroup_RejectsTwoExclusiveRoles()
    {
        var (controller, db) = Create();
        using var _ = db;

        var result = await controller.UpdateGroup(Group(AdminsGroup, "Офис", OrdersAdmin, OrdersAll));

        Assert.Equal(
            "Роли «Заказы ТТ Админ» и «Заказы - Все позиции» взаимоисключающие: в группе «Офис» может быть только одна из них.",
            Message(result));
        Assert.Equal([OrdersAdmin], RoleIdsOf(db, AdminsGroup));
    }

    [Fact]
    public async Task CreateGroup_RejectsTwoExclusiveRoles()
    {
        var (controller, db) = Create();
        using var _ = db;

        var result = await controller.CreateGroup(Group(0, "Новая", OrdersAll, OrdersOwn));

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal(3, db.OfficeGroup.Count());
    }

    [Fact]
    public async Task UpdateGroup_AcceptsRolesWithDifferentOrNoKeys()
    {
        var (controller, db) = Create();
        using var _ = db;

        var result = await controller.UpdateGroup(Group(AdminsGroup, "Офис", OrdersAdmin, Reports));

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal([OrdersAdmin, Reports], RoleIdsOf(db, AdminsGroup));
    }

    [Fact]
    public async Task UpdateGroup_RejectsRoleThatContradictsMembersOtherGroup()
    {
        var (controller, db) = Create();
        using var _ = db;

        // у петрова уже «Собственное управление» из «Управляющих ТТ»
        var result = await controller.UpdateGroup(Group(ReportsGroup, "Аналитики", Reports, OrdersAll));

        Assert.Equal(
            "Пользователь petrov: Роли «Заказы - Собственное управление» (группа «Управляющие ТТ») и «Заказы - Все позиции» (группа «Аналитики») взаимоисключающие: у пользователя может быть только одна из них.",
            Message(result));
        Assert.Equal([Reports], RoleIdsOf(db, ReportsGroup));
    }

    [Fact]
    public async Task UpdateGroup_IgnoresInactiveMembers()
    {
        var (controller, db) = Create();
        using var _ = db;

        // в «Офисе» только уволенный сотрудник: его противоречие сохранению не мешает
        var result = await controller.UpdateGroup(Group(AdminsGroup, "Офис", OrdersAdmin));
        Assert.IsType<OkObjectResult>(result);
        var renamed = await controller.UpdateGroup(Group(ShopsGroup, "Управляющие", OrdersOwn));
        Assert.IsType<OkObjectResult>(renamed);
    }

    [Fact]
    public async Task UpdateUser_RejectsGroupsWithContradictingRoles()
    {
        var (controller, db) = Create();
        using var _ = db;

        var result = await controller.UpdateUser(UserModel(ShopsGroup, AdminsGroup));

        Assert.Equal(
            "Роли «Заказы ТТ Админ» (группа «Офис») и «Заказы - Собственное управление» (группа «Управляющие ТТ») взаимоисключающие: у пользователя может быть только одна из них.",
            Message(result));
        var groups = db.OfficeUser.AsNoTracking().Include(u => u.OfficeGroup).Single(u => u.Id == Manager).OfficeGroup.Select(g => g.ID).Order();
        Assert.Equal([ShopsGroup, ReportsGroup], groups);
    }

    [Fact]
    public async Task UpdateUser_AcceptsGroupsWithoutContradictions()
    {
        var (controller, db) = Create();
        using var _ = db;

        var result = await controller.UpdateUser(UserModel(AdminsGroup, ReportsGroup));

        Assert.IsType<OkObjectResult>(result);
        var groups = db.OfficeUser.AsNoTracking().Include(u => u.OfficeGroup).Single(u => u.Id == Manager).OfficeGroup.Select(g => g.ID).Order();
        Assert.Equal([AdminsGroup, ReportsGroup], groups);
    }

    /// <summary>Петрову досталось противоречие из времён, когда оно не проверялось: «Офис» и «Управляющие ТТ».</summary>
    private static void GiveManagerOldConflict(RKNETDBContext db)
    {
        db.OfficeUser.Include(u => u.OfficeGroup).Single(u => u.Id == Manager).OfficeGroup.Add(db.OfficeGroup.Single(g => g.ID == AdminsGroup));
        db.SaveChanges();
        db.ChangeTracker.Clear();
    }

    [Fact]
    public async Task UpdateUser_OldConflictDoesNotBlockOtherEdits()
    {
        var (controller, db) = Create();
        using var _ = db;
        GiveManagerOldConflict(db);

        var result = await controller.UpdateUser(UserModel(ShopsGroup, AdminsGroup, ReportsGroup));

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task UpdateUser_RejectsNewConflictNextToOldOne()
    {
        var (controller, db) = Create();
        using var _ = db;
        GiveManagerOldConflict(db);
        var all = new OfficeGroup { ID = 13, Name = "Все позиции" };
        all.OfficeRole.Add(db.OfficeRole.Single(r => r.ID == OrdersAll));
        db.OfficeGroup.Add(all);
        db.SaveChanges();
        db.ChangeTracker.Clear();

        var result = await controller.UpdateUser(UserModel(ShopsGroup, AdminsGroup, 13));

        Assert.Contains("Заказы - Все позиции", Message(result));
    }

    [Fact]
    public async Task UpdateGroup_MemberOldConflictInOtherGroupsDoesNotBlockRename()
    {
        var (controller, db) = Create();
        using var _ = db;
        GiveManagerOldConflict(db);

        var result = await controller.UpdateGroup(Group(ReportsGroup, "Аналитика", Reports));

        Assert.IsType<OkObjectResult>(result);
        Assert.Equal("Аналитика", db.OfficeGroup.AsNoTracking().Single(g => g.ID == ReportsGroup).Name);
    }

    [Fact]
    public async Task UpdateRole_MemberOldConflictDoesNotBlockNewKey()
    {
        var (controller, db) = Create();
        using var _ = db;
        GiveManagerOldConflict(db);

        var result = await controller.UpdateRole(new OfficeRole { ID = Reports, Name = "Отчёты - Выручка", Role = "ReportsProfit", ExclusiveKey = "profit" });

        Assert.IsType<OkObjectResult>(result);
    }

    [Fact]
    public async Task UpdateRole_SavesSectionAndKeyTrimmed()
    {
        var (controller, db) = Create();
        using var _ = db;

        var result = await controller.UpdateRole(new OfficeRole { ID = Reports, Name = "Отчёты - Выручка", Role = "ReportsProfit", Section = "  Отчёты ", ExclusiveKey = " profit " });

        Assert.IsType<OkObjectResult>(result);
        var saved = db.OfficeRole.AsNoTracking().Single(r => r.ID == Reports);
        Assert.Equal(("Отчёты", "profit"), (saved.Section, saved.ExclusiveKey));

        // пустые значения сохраняются как null
        await controller.UpdateRole(new OfficeRole { ID = Reports, Name = "Отчёты - Выручка", Role = "ReportsProfit", Section = " ", ExclusiveKey = "" });
        saved = db.OfficeRole.AsNoTracking().Single(r => r.ID == Reports);
        Assert.Equal((null, null), (saved.Section, saved.ExclusiveKey));
    }

    [Fact]
    public async Task UpdateRole_RejectsKeyThatMakesUserContradictory()
    {
        var (controller, db) = Create();
        using var _ = db;

        // у петрова «Отчёты» и «Собственное управление» — один ключ на обе роли сделал бы его противоречивым
        var result = await controller.UpdateRole(new OfficeRole { ID = Reports, Name = "Отчёты - Выручка", Role = "ReportsProfit", ExclusiveKey = "orders" });

        Assert.StartsWith("Пользователь petrov: ", Message(result));
        Assert.Null(db.OfficeRole.AsNoTracking().Single(r => r.ID == Reports).ExclusiveKey);
    }

    [Fact]
    public async Task UpdateRole_RejectsKeyThatMakesGroupContradictory()
    {
        var (controller, db) = Create();
        using var _ = db;
        var group = db.OfficeGroup.Include(g => g.OfficeRole).Single(g => g.ID == ReportsGroup);
        group.OfficeRole.Add(db.OfficeRole.Single(r => r.ID == OrdersAdmin));
        db.OfficeRole.Single(r => r.ID == OrdersAdmin).ExclusiveKey = null;
        db.SaveChanges();
        db.ChangeTracker.Clear();

        var result = await controller.UpdateRole(new OfficeRole { ID = Reports, Name = "Отчёты - Выручка", Role = "ReportsProfit", ExclusiveKey = "orders" });

        Assert.IsType<BadRequestObjectResult>(result);
    }
}
