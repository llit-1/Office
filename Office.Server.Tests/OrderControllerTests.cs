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

    private static OrderController CreateController(RKNETDBContext db, int? userId = null, string? role = null)
    {
        var identity = new ClaimsIdentity(
            userId is int id ? [new Claim(ClaimTypes.NameIdentifier, id.ToString())] : [], "Test");
        if (role != null)
            identity.AddClaim(new Claim(ClaimTypes.Role, role));
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

    private sealed record OrdersSeed(Guid Own, Guid Empty, Guid Foreign);

    /// <summary>
    /// У пользователя 5 две точки: «Тореза 9» с заказами и «Столичная 1» без них; «Невский 87» — чужая.
    /// Id заказов «Тореза 9» по правилу RuleId: 1–12 закрытые (1 — самый старый), 13–14 открытые.
    /// </summary>
    private static OrdersSeed SeedOrders(RKNETDBContext db)
    {
        var seed = new OrdersSeed(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid());
        var own = new Location { Guid = seed.Own, Name = "Тореза 9", Actual = 1 };
        var empty = new Location { Guid = seed.Empty, Name = "Столичная 1", Actual = 1 };
        var user = new OfficeUser("shop", "Анна") { Id = 5, Actual = 1 };
        user.Locations.Add(own);
        user.Locations.Add(empty);
        db.Locations.Add(new Location { Guid = seed.Foreign, Name = "Невский 87", Actual = 1 });
        db.OfficeUser.Add(user);

        var now = DateTime.Now;
        OfficeOrder Order(int id, Guid location, int rule, DateTime closeAt) => new()
        {
            Id = id,
            LocationGuid = location,
            RuleId = rule,
            OfficeUserId = 5,
            CreationDateTime = closeAt,
        };

        for (var id = 1; id <= 12; id++)
            db.OfficeOrders.Add(Order(id, seed.Own, RuleId, now.AddDays(id - 13)));
        var open = Order(13, seed.Own, RuleId, now.AddDays(1));
        open.Items.Add(db.OfficeOrderItems.Single(x => x.Id == 1));
        db.OfficeOrders.AddRange(
            open,
            Order(14, seed.Own, RuleId, now.AddDays(2)),
            Order(15, seed.Own, OtherRuleId, now.AddDays(1)),
            Order(16, seed.Foreign, RuleId, now.AddDays(1)));
        db.SaveChanges();
        db.ChangeTracker.Clear();
        return seed;
    }

    [Fact]
    public async Task GetOrders_ReturnsOpenOrdersAndTenPreviousForEachUserLocation()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);

        var result = await CreateController(db, userId: 5).GetOrders(RuleId);

        var dtos = Assert.IsType<List<OrderController.OrdersDTO>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        // «Столичная 1» без заказов в ответ не попадает
        var dto = Assert.Single(dtos);
        Assert.Equal(seed.Own, dto.LocationGUID);
        Assert.Equal("Тореза 9", dto.Location);
        // открытые 14 и 13, затем десять последних закрытых: 12…3
        Assert.Equal(Enumerable.Range(3, 12).Reverse(), dto.OfficeOrders!.Select(x => x.Id));
        Assert.Equal(["Батон"], dto.OfficeOrders!.Single(x => x.Id == 13).Items.Select(x => x.Name));
    }

    [Fact]
    public async Task GetOrders_ReturnsEmptyArrayWhenNoLocationHasOrders()
    {
        using var db = CreateDb();
        SeedOrders(db);

        var result = await CreateController(db, userId: 5).GetOrders(ruleId: 99);

        Assert.Empty(Assert.IsType<List<OrderController.OrdersDTO>>(Assert.IsType<OkObjectResult>(result.Result).Value));
    }

    [Fact]
    public async Task GetOrderItems_ReturnsItemsOfOrder()
    {
        using var db = CreateDb();
        SeedOrders(db);

        var result = await CreateController(db, userId: 5).GetOrderItems(13);

        var items = Assert.IsType<List<OfficeOrderItem>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(["Батон"], items.Select(x => x.Name));
    }

    [Fact]
    public async Task GetOrderItems_ReturnsNotFoundForUnknownOrder()
    {
        using var db = CreateDb();
        SeedOrders(db);

        var result = await CreateController(db, userId: 5).GetOrderItems(99);

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Fact]
    public async Task GetOrderItems_ForbidsOrderOfAnotherUsersLocation()
    {
        using var db = CreateDb();
        SeedOrders(db);

        var result = await CreateController(db, userId: 5).GetOrderItems(16);

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task GetOrders_ReturnsOnlyRequestedLocation()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);

        var result = await CreateController(db, userId: 5).GetOrders(RuleId, seed.Own);

        var dtos = Assert.IsType<List<OrderController.OrdersDTO>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal([seed.Own], dtos.Select(x => x.LocationGUID));
        Assert.Equal(12, dtos[0].OfficeOrders!.Count);
    }

    [Fact]
    public async Task GetOrders_ForbidsLocationOfAnotherUser()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);

        var result = await CreateController(db, userId: 5).GetOrders(RuleId, seed.Foreign);

        Assert.IsType<ForbidResult>(result.Result);
    }

    /// <summary>«Тореза 9» — точка франчайзи: ей доступен только «Батон»; «Пакет» — только своим точкам.</summary>
    private static OrdersSeed SeedContents(RKNETDBContext db)
    {
        var seed = SeedOrders(db);
        var entity = new Entity { Guid = Guid.NewGuid(), Name = "ИП Иванов", Owner = 0 };
        db.Entity.Add(entity);
        db.LocationVersions.Add(new LocationVersion
        {
            Guid = Guid.NewGuid(), Name = "Тореза 9", LocationGuid = seed.Own, EntityGuid = entity.Guid, Actual = 1,
        });
        db.OfficeOrderLocationRules.Add(new OfficeOrderLocationRule { LocationGuid = seed.Own, RuleId = RuleId, ShipmentDayOffset = 2 });
        db.OfficeOrderItems.Single(x => x.Id == 1).AvaliableForFranchise = 1;
        db.OfficeOrderItems.Single(x => x.Id == 2).AvaliableForFranchise = 1; // Actual = 0
        db.OfficeOrderItems.Single(x => x.Id == 3).AvaliableForNative = 1;
        db.SaveChanges();
        db.ChangeTracker.Clear();
        return seed;
    }

    [Fact]
    public async Task GetOrderContents_ReturnsScheduleAndItemsAvailableToLocation()
    {
        using var db = CreateDb();
        var seed = SeedContents(db);
        var before = DateTime.Now;

        var result = await CreateController(db, userId: 5).GetOrderContents(RuleId, seed.Own);

        var dto = Assert.IsType<OrderController.OrderContentsDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        // одна дата до текущего момента и двадцать после, по возрастанию, каждый день в 12:00
        Assert.Equal(21, dto.OrderCreationDateTimes.Count);
        Assert.Equal(dto.OrderCreationDateTimes.OrderBy(x => x), dto.OrderCreationDateTimes);
        Assert.All(dto.OrderCreationDateTimes, x => Assert.Equal(TimeSpan.FromHours(12), x.TimeOfDay));
        Assert.True(dto.OrderCreationDateTimes[0] < before);
        Assert.True(dto.OrderCreationDateTimes[1] >= before);
        Assert.Equal(dto.OrderCreationDateTimes[1], dto.OrderCreationDateTime);
        // отгрузка: следующая полночь после закрытия заказа плюс сдвиг локации в два дня
        Assert.Equal(dto.OrderCreationDateTime.Date.AddDays(3), dto.OrderShipmentDateTime);
        Assert.Empty(dto.OrderItems);
        Assert.Equal(["Батон"], dto.ItemGroups.SelectMany(x => x.Items).Select(x => x.Name));
    }

    [Fact]
    public async Task GetOrderContents_ReturnsItemsOfExistingOrderForRequestedDate()
    {
        using var db = CreateDb();
        var seed = SeedContents(db);
        var order = await db.OfficeOrders.AsNoTracking().SingleAsync(x => x.Id == 13);

        var result = await CreateController(db, userId: 5).GetOrderContents(RuleId, seed.Own, order.CreationDateTime);

        var dto = Assert.IsType<OrderController.OrderContentsDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(order.CreationDateTime, dto.OrderCreationDateTime);
        Assert.Equal(order.CreationDateTime.Date.AddDays(3), dto.OrderShipmentDateTime);
        Assert.Equal(["Батон"], dto.OrderItems.Select(x => x.Name));
    }

    [Fact]
    public async Task GetOrderContents_UsesShipmentCronAsIsWhenLocationHasNoOffset()
    {
        using var db = CreateDb();
        var seed = SeedContents(db);

        var result = await CreateController(db, userId: 5).GetOrderContents(RuleId, seed.Empty);

        var dto = Assert.IsType<OrderController.OrderContentsDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(dto.OrderCreationDateTime.Date.AddDays(1), dto.OrderShipmentDateTime);
    }

    [Fact]
    public async Task GetOrderContents_ShipsOnTheSameMomentWhenShipmentCronMatchesOrderClosing()
    {
        using var db = CreateDb();
        var seed = SeedContents(db);

        // еженедельное правило: и закрытие заказа, и отгрузка — понедельник 00:00
        var result = await CreateController(db, userId: 5).GetOrderContents(OtherRuleId, seed.Own);

        var dto = Assert.IsType<OrderController.OrderContentsDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(DayOfWeek.Monday, dto.OrderCreationDateTime.DayOfWeek);
        Assert.Equal(dto.OrderCreationDateTime, dto.OrderShipmentDateTime);
    }

    [Fact]
    public async Task GetOrderContents_ForbidsLocationOfAnotherUser()
    {
        using var db = CreateDb();
        var seed = SeedContents(db);

        var result = await CreateController(db, userId: 5).GetOrderContents(RuleId, seed.Foreign);

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task GetOrderContents_ReturnsNotFoundForUnknownRule()
    {
        using var db = CreateDb();
        var seed = SeedContents(db);

        var result = await CreateController(db, userId: 5).GetOrderContents(99, seed.Own);

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    private static OfficeOrder OrderBody(Guid location, DateTime creationDateTime, params int[] itemIds) => new()
    {
        LocationGuid = location,
        RuleId = RuleId,
        CreationDateTime = creationDateTime,
        OfficeUserId = 777, // игнорируется: пользователь берётся из токена
        Items = itemIds.Select(id => new OfficeOrderItem { Id = id }).ToList(),
    };

    [Fact]
    public async Task SaveOrder_CreatesOrderWithItemsWhenThereIsNoneForDateLocationAndRule()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);
        var closeAt = new DateTime(2030, 1, 10, 12, 0, 0);

        var result = await CreateController(db, userId: 5).SaveOrder(OrderBody(seed.Empty, closeAt, 1, 3));

        var created = Assert.IsType<OfficeOrder>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var saved = await db.OfficeOrders.AsNoTracking().Include(x => x.Items).SingleAsync(x => x.Id == created.Id);
        Assert.Equal((seed.Empty, RuleId, closeAt, 5), (saved.LocationGuid, saved.RuleId, saved.CreationDateTime, saved.OfficeUserId));
        Assert.Equal([1, 3], saved.Items.Select(x => x.Id).Order());
        Assert.Equal(4, await db.OfficeOrderItems.CountAsync());
    }

    [Fact]
    public async Task SaveOrder_ReplacesUserAndItemsOfExistingOrder()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);
        var closeAt = new DateTime(2030, 1, 10, 12, 0, 0);
        var colleague = new OfficeUser("colleague", "Ольга") { Id = 6, Actual = 1 };
        colleague.Locations.Add(db.Locations.Single(x => x.Guid == seed.Own));
        db.OfficeUser.Add(colleague);
        var existing = new OfficeOrder { Id = 50, LocationGuid = seed.Own, RuleId = RuleId, OfficeUserId = 5, CreationDateTime = closeAt };
        existing.Items.Add(db.OfficeOrderItems.Single(x => x.Id == 1));
        db.OfficeOrders.Add(existing);
        db.SaveChanges();
        db.ChangeTracker.Clear();
        var ordersBefore = await db.OfficeOrders.CountAsync();

        var result = await CreateController(db, userId: 6).SaveOrder(OrderBody(seed.Own, closeAt, 3));

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(ordersBefore, await db.OfficeOrders.CountAsync());
        var saved = await db.OfficeOrders.AsNoTracking().Include(x => x.Items).SingleAsync(x => x.Id == 50);
        Assert.Equal(6, saved.OfficeUserId);
        Assert.Equal([3], saved.Items.Select(x => x.Id));
    }

    [Fact]
    public async Task SaveOrder_RejectsDateThatIsNotOnRuleSchedule()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);

        // правило закрывает заказы каждый день в 12:00
        var result = await CreateController(db, userId: 5).SaveOrder(OrderBody(seed.Own, new DateTime(2030, 1, 10, 13, 0, 0), 1));

        Assert.IsType<BadRequestObjectResult>(result.Result);
    }

    [Fact]
    public async Task SaveOrder_RejectsClosedOrder()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);
        var ordersBefore = await db.OfficeOrders.CountAsync();

        var result = await CreateController(db, userId: 5).SaveOrder(OrderBody(seed.Own, new DateTime(2020, 1, 10, 12, 0, 0), 1));

        Assert.IsType<ConflictObjectResult>(result.Result);
        Assert.Equal(ordersBefore, await db.OfficeOrders.CountAsync());
    }

    [Fact]
    public async Task SaveOrder_LetsAdminSaveClosedOrder()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);

        var result = await CreateController(db, userId: 5, role: "OrdersTTAdmin")
            .SaveOrder(OrderBody(seed.Own, new DateTime(2020, 1, 10, 12, 0, 0), 1));

        Assert.IsType<OkObjectResult>(result.Result);
    }

    [Fact]
    public async Task SaveOrder_ForbidsLocationOfAnotherUser()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);

        var result = await CreateController(db, userId: 5).SaveOrder(OrderBody(seed.Foreign, new DateTime(2030, 1, 10, 12, 0, 0), 1));

        Assert.IsType<ForbidResult>(result.Result);
    }

    [Fact]
    public async Task SaveOrder_RejectsUnknownItems()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);
        var ordersBefore = await db.OfficeOrders.CountAsync();

        var result = await CreateController(db, userId: 5).SaveOrder(OrderBody(seed.Own, new DateTime(2030, 1, 10, 12, 0, 0), 1, 99));

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal(ordersBefore, await db.OfficeOrders.CountAsync());
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
