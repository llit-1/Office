using System.Security.Claims;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Services;
using Xunit;

namespace Office.Server.Tests;

public class OrderControllerTests
{
    private const int RuleId = 1;
    private const int OtherRuleId = 2;
    private const int BreadGroupId = 1;
    private const int PackGroupId = 2;

    private static RKNETDBContext CreateDb()
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.OfficeOrderRules.AddRange(
            new OfficeOrderRule { Id = RuleId, Name = "Регулярный", Interval = "0 12 * * *", ShipmentInterval = "0 0 * * *" },
            new OfficeOrderRule { Id = OtherRuleId, Name = "Еженедельный", Interval = "0 0 * * 1", ShipmentInterval = "0 0 * * 1" });
        db.OfficeOrderGroups.AddRange(
            new OfficeOrderGroup { Id = BreadGroupId, Name = "Хлеб" },
            new OfficeOrderGroup { Id = PackGroupId, Name = "Упаковка" });
        db.OfficeOrderItems.AddRange(
            new OfficeOrderItem { Id = 1, Rkcode = 100, Name = "Батон", MinValue = 2, Step = 2, GroupId = BreadGroupId, RuleId = RuleId },
            new OfficeOrderItem { Id = 2, Rkcode = 101, Name = "Багет", MinValue = 1, Step = 1, GroupId = BreadGroupId, RuleId = RuleId, Actual = 0 },
            new OfficeOrderItem { Id = 3, Rkcode = 200, Name = "Пакет", MinValue = 50, Step = 50, GroupId = PackGroupId, RuleId = RuleId },
            new OfficeOrderItem { Id = 4, Rkcode = 300, Name = "Коробка", MinValue = 10, Step = 10, GroupId = PackGroupId, RuleId = OtherRuleId });
        db.SaveChanges();
        db.ChangeTracker.Clear();
        return db;
    }

    private static OrderController CreateController(RKNETDBContext db, int? userId = null)
    {
        var identity = new ClaimsIdentity(
            userId is int id ? [new Claim(ClaimTypes.NameIdentifier, id.ToString())] : [], "Test");
        return new OrderController(db, new GlobalService(db))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(identity) }
            }
        };
    }

    private static OfficeOrderItem NewItem(int? rkcode) => new()
    {
        Rkcode = rkcode,
        Name = "Круассан",
        MinValue = 6,
        Step = 6,
        GroupId = BreadGroupId,
        RuleId = RuleId,
        AvaliableForNative = 1,
    };

    [Fact]
    public async Task GetItems_ReturnsItemsOfRuleSplitByGroups()
    {
        using var db = CreateDb();

        var result = await CreateController(db).GetItems(RuleId);

        var groups = Assert.IsType<List<OrderController.OrderItemGroupDto>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(["Упаковка", "Хлеб"], groups.Select(x => x.Name));
        Assert.Equal(["Пакет"], groups[0].Items.Select(x => x.Name));
        Assert.Equal(["Багет", "Батон"], groups[1].Items.Select(x => x.Name));
    }

    [Theory]
    [InlineData(1, new[] { "Пакет", "Батон" })]
    [InlineData(0, new[] { "Багет" })]
    public async Task GetItems_FiltersByActualWhenItIsPassed(int actual, string[] expectedItems)
    {
        using var db = CreateDb();

        var result = await CreateController(db).GetItems(RuleId, actual);

        var groups = Assert.IsType<List<OrderController.OrderItemGroupDto>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(expectedItems, groups.SelectMany(x => x.Items).Select(x => x.Name));
    }

    [Fact]
    public async Task GetRules_ReturnsRulesAndOnlyLocationsOfCurrentUser()
    {
        using var db = CreateDb();
        var own = new Location { Guid = Guid.NewGuid(), Name = "Тореза 9", Actual = 1 };
        var user = new OfficeUser("shop", "Анна") { Id = 5, Actual = 1 };
        user.Locations.Add(own);
        db.Locations.Add(new Location { Guid = Guid.NewGuid(), Name = "Невский 87", Actual = 1 });
        db.OfficeUser.Add(user);
        db.SaveChanges();

        var result = await CreateController(db, userId: 5).GetRules();

        var dto = Assert.IsType<OrderController.LocationRulesDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal([own.Guid], dto.Locations.Select(x => x.Guid));
        Assert.Equal(["Еженедельный", "Регулярный"], dto.Rules.Select(x => x.Name));
    }

    [Fact]
    public async Task GetRules_ReturnsUnauthorizedWithoutUserId()
    {
        using var db = CreateDb();

        var result = await CreateController(db).GetRules();

        Assert.IsType<UnauthorizedResult>(result.Result);
    }

    [Fact]
    public async Task CreateItem_SavesItem()
    {
        using var db = CreateDb();

        var result = await CreateController(db).CreateItem(NewItem(500));

        var created = Assert.IsType<OfficeOrderItem>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var saved = await db.OfficeOrderItems.AsNoTracking().SingleAsync(x => x.Id == created.Id);
        Assert.Equal(500, saved.Rkcode);
        Assert.Equal(1, saved.Actual);
    }

    [Fact]
    public async Task CreateItem_RejectsExistingRkcode()
    {
        using var db = CreateDb();

        var result = await CreateController(db).CreateItem(NewItem(100));

        Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.Equal(4, await db.OfficeOrderItems.CountAsync());
    }

    [Fact]
    public async Task CreateItem_RejectsUnknownGroup()
    {
        using var db = CreateDb();
        var item = NewItem(500);
        item.GroupId = 99;

        var result = await CreateController(db).CreateItem(item);

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task UpdateItem_ReplacesAllFields()
    {
        using var db = CreateDb();
        var body = NewItem(100);
        body.GroupId = PackGroupId;
        body.RuleId = OtherRuleId;

        var result = await CreateController(db).UpdateItem(1, body);

        Assert.IsType<OkObjectResult>(result.Result);
        var saved = await db.OfficeOrderItems.AsNoTracking().SingleAsync(x => x.Id == 1);
        Assert.Equal("Круассан", saved.Name);
        Assert.Equal(6, saved.Step);
        Assert.Equal(PackGroupId, saved.GroupId);
        Assert.Equal(OtherRuleId, saved.RuleId);
        Assert.Equal(1, saved.AvaliableForNative);
    }

    [Fact]
    public async Task UpdateItem_RejectsRkcodeOfAnotherItem()
    {
        using var db = CreateDb();

        var result = await CreateController(db).UpdateItem(1, NewItem(200));

        Assert.IsType<ConflictObjectResult>(result.Result);
    }

    [Fact]
    public async Task UpdateItem_ReturnsNotFoundForUnknownId()
    {
        using var db = CreateDb();

        var result = await CreateController(db).UpdateItem(99, NewItem(500));

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Fact]
    public async Task DeleteItem_MarksItemNotActual()
    {
        using var db = CreateDb();

        var result = await CreateController(db).DeleteItem(1);

        Assert.IsType<NoContentResult>(result);
        Assert.Equal(0, (await db.OfficeOrderItems.AsNoTracking().SingleAsync(x => x.Id == 1)).Actual);
    }
}
