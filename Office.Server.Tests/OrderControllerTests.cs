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
    private const string AdminRole = "OrdersTTAdmin";
    private const string AllItemsRole = "Order_man";
    private const string NativeItemsRole = "Order_woman";

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
            new OfficeOrderItem { Id = 1, Rkcode = 100, Name = "Батон", Step = 2, GroupId = BreadGroupId, RuleId = RuleId },
            new OfficeOrderItem { Id = 2, Rkcode = 101, Name = "Багет", Step = 1, GroupId = BreadGroupId, RuleId = RuleId, Actual = 0 },
            new OfficeOrderItem { Id = 3, Rkcode = 200, Name = "Пакет", Step = 50, GroupId = PackGroupId, RuleId = RuleId },
            new OfficeOrderItem { Id = 4, Rkcode = 300, Name = "Коробка", Step = 10, GroupId = PackGroupId, RuleId = OtherRuleId });
        db.SaveChanges();
        db.ChangeTracker.Clear();
        return db;
    }

    private static OrderController CreateController(RKNETDBContext db, int? userId = null, string? role = AllItemsRole)
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
    public async Task GetItems_ReturnsOnlyNativeItemsForNativeItemsRole()
    {
        using var db = CreateDb();
        db.OfficeOrderItems.Single(x => x.Id == 3).AvaliableForNative = 1;
        db.SaveChanges();

        var result = await CreateController(db, role: NativeItemsRole).GetItems(RuleId);

        var groups = Assert.IsType<List<OrderController.OrderItemGroupDto>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(["Пакет"], groups.SelectMany(x => x.Items).Select(x => x.Name));
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
        // по Id, а не по названию
        Assert.Equal([RuleId, OtherRuleId], dto.Rules.Select(x => x.Id));
        Assert.Equal(["Регулярный", "Еженедельный"], dto.Rules.Select(x => x.Name));
    }

    [Theory]
    // у «Еженедельного» единственная позиция «Коробка» не для собственного управления
    [InlineData(AdminRole, new[] { RuleId, OtherRuleId })]
    [InlineData(AllItemsRole, new[] { RuleId, OtherRuleId })]
    [InlineData(NativeItemsRole, new[] { RuleId })]
    public async Task GetRules_ReturnsRulesWithItemsAvailableToRole(string role, int[] expected)
    {
        using var db = CreateDb();
        db.OfficeUser.Add(new OfficeUser("shop", "Анна") { Id = 5, Actual = 1 });
        db.OfficeOrderItems.Single(x => x.Id == 1).AvaliableForNative = 1;
        db.SaveChanges();

        var result = await CreateController(db, userId: 5, role: role).GetRules();

        var dto = Assert.IsType<OrderController.LocationRulesDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        // правила приходят все, а доступные с позициями — отдельным списком
        Assert.Equal([RuleId, OtherRuleId], dto.Rules.Select(x => x.Id));
        Assert.Equal(expected, dto.AvailableRuleIds);
    }

    [Fact]
    public async Task GetRules_LeavesOutRuleWhoseItemsAreAllDeleted()
    {
        using var db = CreateDb();
        db.OfficeUser.Add(new OfficeUser("shop", "Анна") { Id = 5, Actual = 1 });
        db.OfficeOrderItems.Single(x => x.Id == 4).Actual = 0;
        db.SaveChanges();

        var result = await CreateController(db, userId: 5, role: AdminRole).GetRules();

        var dto = Assert.IsType<OrderController.LocationRulesDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal([RuleId], dto.AvailableRuleIds);
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
        open.Lines.Add(new OfficeOrderLine { ItemId = 1, Quantity = 6 });
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
        var line = Assert.Single(dto.OfficeOrders!.Single(x => x.Id == 13).Items);
        Assert.Equal(("Батон", 6d), (line.Name!, line.Quantity));
    }

    [Fact]
    public async Task GetOrders_ReturnsWhoPlacedOrderAndWhenItShips()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);
        db.OfficeOrderLocationRules.Add(new OfficeOrderLocationRule { LocationGuid = seed.Own, RuleId = RuleId, ShipmentDayOffset = 2 });
        db.SaveChanges();
        db.ChangeTracker.Clear();

        var result = await CreateController(db, userId: 5).GetOrders(RuleId);

        var dtos = Assert.IsType<List<OrderController.OrdersDTO>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var order = Assert.Single(dtos).OfficeOrders!.Single(x => x.Id == 13);
        // у пользователя заполнено только имя
        Assert.Equal("Анна", order.UserName);
        Assert.Equal(5, order.OfficeUserId);
        // отгрузка: первая полночь не раньше закрытия заказа плюс сдвиг локации в два дня
        var midnight = order.CreationDateTime.TimeOfDay == TimeSpan.Zero
            ? order.CreationDateTime
            : order.CreationDateTime.Date.AddDays(1);
        Assert.Equal(midnight.AddDays(2), order.ShipmentDateTime);
    }

    [Fact]
    public async Task GetOrders_AddsRuleShipmentOffsetToLocationOffset()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);
        db.OfficeOrderRules.Single(x => x.Id == RuleId).DefaultShipmentDayOffset = 1;
        db.OfficeOrderLocationRules.Add(new OfficeOrderLocationRule { LocationGuid = seed.Own, RuleId = RuleId, ShipmentDayOffset = 2 });
        db.SaveChanges();
        db.ChangeTracker.Clear();

        var result = await CreateController(db, userId: 5).GetOrders(RuleId);

        var dtos = Assert.IsType<List<OrderController.OrdersDTO>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var order = Assert.Single(dtos).OfficeOrders!.Single(x => x.Id == 13);
        var midnight = order.CreationDateTime.TimeOfDay == TimeSpan.Zero
            ? order.CreationDateTime
            : order.CreationDateTime.Date.AddDays(1);
        // полночь по крону + день правила + два дня локации
        Assert.Equal(midnight.AddDays(3), order.ShipmentDateTime);
    }

    [Fact]
    public async Task GetOrders_LeavesShipmentEmptyWhenShipmentScheduleIsBroken()
    {
        using var db = CreateDb();
        SeedOrders(db);
        db.OfficeOrderRules.Single(x => x.Id == RuleId).ShipmentInterval = "нет";
        db.SaveChanges();
        db.ChangeTracker.Clear();

        var result = await CreateController(db, userId: 5).GetOrders(RuleId);

        var dtos = Assert.IsType<List<OrderController.OrdersDTO>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.All(Assert.Single(dtos).OfficeOrders!, order => Assert.Null(order.ShipmentDateTime));
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

        var items = Assert.IsType<List<OrderController.OrderLineDto>>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var item = Assert.Single(items);
        // позиция каталога и сколько её заказано
        Assert.Equal((1, "Батон", 100, 2d, 6d), (item.Id, item.Name!, item.Rkcode!.Value, item.Step, item.Quantity));
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

    /// <summary>У «Тореза 9» сдвиг отгрузки в два дня; «Пакет» доступен и NativeItemsRole, «Батон» — нет.</summary>
    private static OrdersSeed SeedContents(RKNETDBContext db)
    {
        var seed = SeedOrders(db);
        db.OfficeOrderLocationRules.Add(new OfficeOrderLocationRule { LocationGuid = seed.Own, RuleId = RuleId, ShipmentDayOffset = 2 });
        db.OfficeOrderItems.Single(x => x.Id == 3).AvaliableForNative = 1;
        db.SaveChanges();
        db.ChangeTracker.Clear();
        return seed;
    }

    [Fact]
    public async Task GetOrderContents_ReturnsScheduleAndAllActualItemsOfRule()
    {
        using var db = CreateDb();
        var seed = SeedContents(db);
        var before = DateTime.Now;

        var result = await CreateController(db, userId: 5).GetOrderContents(RuleId, seed.Own);

        var dto = Assert.IsType<OrderController.OrderContentsDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        // одна дата до текущего момента и семь после, по возрастанию, каждый день в 12:00
        var match = Assert.Single(dto.DateTimeMatches);
        var creations = match.OrderCreationDateTime;
        Assert.Equal(8, creations.Count);
        Assert.Equal(creations.OrderBy(x => x), creations);
        Assert.All(creations, x => Assert.Equal(TimeSpan.FromHours(12), x.TimeOfDay));
        Assert.True(creations[0] < before);
        Assert.True(creations[1] >= before);
        Assert.Equal(creations[1], dto.OrderCreationDateTime);
        // отгрузка: следующая полночь после закрытия заказа плюс сдвиг локации в два дня
        Assert.Equal(dto.OrderCreationDateTime.Date.AddDays(3), dto.OrderShipmentDateTime);
        Assert.Empty(dto.OrderItems);
        // к каждой дате формирования — её доставка: следующая полночь плюс два дня локации
        Assert.Equal(creations.Select(x => x.Date.AddDays(3)), match.OrderShipmentDateTime);
        Assert.Equal(dto.OrderShipmentDateTime, match.OrderShipmentDateTime[1]);
        // «Багет» удалён (Actual = 0), «Коробка» — другого правила
        Assert.Equal(["Пакет", "Батон"], dto.ItemGroups.SelectMany(x => x.Items).Select(x => x.Name));
    }

    [Theory]
    [InlineData(AdminRole, new[] { "Пакет", "Батон" })]
    [InlineData(AllItemsRole, new[] { "Пакет", "Батон" })]
    [InlineData(NativeItemsRole, new[] { "Пакет" })]
    public async Task GetOrderContents_ReturnsItemsAvailableToRole(string role, string[] expectedItems)
    {
        using var db = CreateDb();
        var seed = SeedContents(db);

        var result = await CreateController(db, userId: 5, role: role).GetOrderContents(RuleId, seed.Own);

        var dto = Assert.IsType<OrderController.OrderContentsDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(expectedItems, dto.ItemGroups.SelectMany(x => x.Items).Select(x => x.Name));
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
        var line = Assert.Single(dto.OrderItems);
        Assert.Equal(("Батон", 6d), (line.Name!, line.Quantity));
    }

    [Fact]
    public async Task GetOrderContents_AddsRuleShipmentOffsetForEveryLocation()
    {
        using var db = CreateDb();
        var seed = SeedContents(db);
        db.OfficeOrderRules.Single(x => x.Id == RuleId).DefaultShipmentDayOffset = 1;
        db.SaveChanges();
        db.ChangeTracker.Clear();
        var controller = CreateController(db, userId: 5);

        var own = Assert.IsType<OrderController.OrderContentsDto>(Assert.IsType<OkObjectResult>((await controller.GetOrderContents(RuleId, seed.Own)).Result).Value);
        var empty = Assert.IsType<OrderController.OrderContentsDto>(Assert.IsType<OkObjectResult>((await controller.GetOrderContents(RuleId, seed.Empty)).Result).Value);

        // следующая полночь + день правила + два дня локации
        Assert.Equal(own.OrderCreationDateTime.Date.AddDays(4), own.OrderShipmentDateTime);
        // у локации без своего сдвига — только день правила
        Assert.Equal(empty.OrderCreationDateTime.Date.AddDays(2), empty.OrderShipmentDateTime);
    }

    [Fact]
    public async Task GetOrderContents_AcceptsScheduleWithTrailingSpace()
    {
        using var db = CreateDb();
        var seed = SeedContents(db);
        // так расписание записано у правила «Ежедневный заказ(завтра)» в рабочей базе
        db.OfficeOrderRules.Single(x => x.Id == RuleId).Interval = "0 12 * * * ";
        db.SaveChanges();
        db.ChangeTracker.Clear();

        var result = await CreateController(db, userId: 5).GetOrderContents(RuleId, seed.Own);

        Assert.IsType<OkObjectResult>(result.Result);
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

    /// <summary>Заказ с наименьшим допустимым количеством каждой позиции: «Батон» — 2, «Пакет» — 50.</summary>
    private static OrderController.SaveOrderRequest OrderBody(Guid location, DateTime creationDateTime, params int[] itemIds) =>
        OrderBody(location, creationDateTime, itemIds.Select(id => (id, id == 1 ? 2d : id == 3 ? 50d : 1d)).ToArray());

    private static OrderController.SaveOrderRequest OrderBody(Guid location, DateTime creationDateTime, params (int Id, double Quantity)[] lines) => new()
    {
        LocationGuid = location,
        RuleId = RuleId,
        CreationDateTime = creationDateTime,
        Items = lines.Select(line => new OrderController.SaveOrderLine { Id = line.Id, Quantity = line.Quantity }).ToList(),
    };

    private static async Task<List<(int ItemId, double Quantity)>> SavedLinesAsync(RKNETDBContext db, int orderId) =>
        (await db.OfficeOrderLines.AsNoTracking().Where(x => x.OrderId == orderId).OrderBy(x => x.ItemId).ToListAsync())
            .Select(x => (x.ItemId, x.Quantity))
            .ToList();

    [Fact]
    public async Task SaveOrder_CreatesOrderWithItemsWhenThereIsNoneForDateLocationAndRule()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);
        var closeAt = new DateTime(2030, 1, 10, 12, 0, 0);

        var result = await CreateController(db, userId: 5).SaveOrder(OrderBody(seed.Empty, closeAt, 1, 3));

        var created = Assert.IsType<OrderController.OrderDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        var saved = await db.OfficeOrders.AsNoTracking().SingleAsync(x => x.Id == created.Id);
        Assert.Equal((seed.Empty, RuleId, closeAt, 5), (saved.LocationGuid, saved.RuleId, saved.CreationDateTime, saved.OfficeUserId));
        Assert.Equal([(1, 2d), (3, 50d)], await SavedLinesAsync(db, created.Id));
        Assert.Equal(4, await db.OfficeOrderItems.CountAsync());
        // в ответе — тот же заказ, каким он придёт в списке: кто оформил, отгрузка, позиции с количеством
        Assert.Equal("Анна", created.UserName);
        Assert.Equal(closeAt.Date.AddDays(1), created.ShipmentDateTime);
        Assert.Equal([("Батон", 2d), ("Пакет", 50d)], created.Items.Select(x => (x.Name!, x.Quantity)));
    }

    [Fact]
    public async Task SaveOrder_SavesQuantityOfEachItem()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);
        var closeAt = new DateTime(2030, 1, 10, 12, 0, 0);

        var result = await CreateController(db, userId: 5).SaveOrder(OrderBody(seed.Empty, closeAt, (1, 14d), (3, 150d)));

        var created = Assert.IsType<OrderController.OrderDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal([(1, 14d), (3, 150d)], await SavedLinesAsync(db, created.Id));
    }

    [Theory]
    [InlineData(12.5)]
    [InlineData(37.5)]
    [InlineData(100)]
    public async Task SaveOrder_AcceptsMultiplesOfFractionalStep(double quantity)
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);
        db.OfficeOrderItems.Single(x => x.Id == 1).Step = 12.5;
        db.SaveChanges();
        db.ChangeTracker.Clear();

        var result = await CreateController(db, userId: 5).SaveOrder(OrderBody(seed.Empty, new DateTime(2030, 1, 10, 12, 0, 0), (1, quantity)));

        var created = Assert.IsType<OrderController.OrderDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal([(1, quantity)], await SavedLinesAsync(db, created.Id));
    }

    [Theory]
    [InlineData(10)]   // меньше шага 12,5
    [InlineData(30)]   // не кратно 12,5
    [InlineData(12.4)]
    public async Task SaveOrder_RejectsQuantityThatIsNotMultipleOfFractionalStep(double quantity)
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);
        db.OfficeOrderItems.Single(x => x.Id == 1).Step = 12.5;
        db.SaveChanges();
        db.ChangeTracker.Clear();

        var result = await CreateController(db, userId: 5).SaveOrder(OrderBody(seed.Empty, new DateTime(2030, 1, 10, 12, 0, 0), (1, quantity)));

        var message = Assert.IsType<BadRequestObjectResult>(result.Result).Value!.GetType().GetProperty("message")!.GetValue(Assert.IsType<BadRequestObjectResult>(result.Result).Value);
        Assert.Equal("Количество позиции «Батон» должно быть кратно 12,5.", message);
    }

    [Theory]
    [InlineData(0)]   // пусто
    [InlineData(-2)]
    [InlineData(1)]   // меньше шага «Батона» — 2
    [InlineData(5)]   // не кратно шагу 2
    public async Task SaveOrder_RejectsQuantityThatIsNotMultipleOfStep(int quantity)
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);
        var ordersBefore = await db.OfficeOrders.CountAsync();

        var result = await CreateController(db, userId: 5).SaveOrder(OrderBody(seed.Empty, new DateTime(2030, 1, 10, 12, 0, 0), (1, quantity)));

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Equal(ordersBefore, await db.OfficeOrders.CountAsync());
    }

    [Fact]
    public async Task SaveOrder_RejectsItemListedTwice()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);

        var result = await CreateController(db, userId: 5).SaveOrder(OrderBody(seed.Empty, new DateTime(2030, 1, 10, 12, 0, 0), (1, 2d), (1, 4d)));

        Assert.IsType<BadRequestObjectResult>(result.Result);
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
        existing.Lines.Add(new OfficeOrderLine { ItemId = 1, Quantity = 2 });
        db.OfficeOrders.Add(existing);
        db.SaveChanges();
        db.ChangeTracker.Clear();
        var ordersBefore = await db.OfficeOrders.CountAsync();

        var result = await CreateController(db, userId: 6).SaveOrder(OrderBody(seed.Own, closeAt, 3));

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal(ordersBefore, await db.OfficeOrders.CountAsync());
        var saved = await db.OfficeOrders.AsNoTracking().SingleAsync(x => x.Id == 50);
        Assert.Equal(6, saved.OfficeUserId);
        Assert.Equal([(3, 50d)], await SavedLinesAsync(db, 50));
    }

    [Fact]
    public async Task SaveOrder_ChangesQuantityOfKeptItemAndAddsNewOnes()
    {
        using var db = CreateDb();
        var seed = SeedOrders(db);
        var closeAt = new DateTime(2030, 1, 10, 12, 0, 0);
        var existing = new OfficeOrder { Id = 50, LocationGuid = seed.Own, RuleId = RuleId, OfficeUserId = 5, CreationDateTime = closeAt };
        existing.Lines.Add(new OfficeOrderLine { ItemId = 1, Quantity = 2 });
        db.OfficeOrders.Add(existing);
        db.SaveChanges();
        db.ChangeTracker.Clear();

        var result = await CreateController(db, userId: 5).SaveOrder(OrderBody(seed.Own, closeAt, (1, 8d), (3, 100d)));

        Assert.IsType<OkObjectResult>(result.Result);
        Assert.Equal([(1, 8d), (3, 100d)], await SavedLinesAsync(db, 50));
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
        var closeAt = new DateTime(2020, 1, 10, 12, 0, 0);

        var result = await CreateController(db, userId: 5, role: AdminRole).SaveOrder(OrderBody(seed.Own, closeAt, 1));

        var created = Assert.IsType<OrderController.OrderDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal(closeAt, created.CreationDateTime);
    }

    [Fact]
    public async Task SaveOrder_ForbidsNativeItemsRoleToOrderItemThatIsNotNative()
    {
        using var db = CreateDb();
        var seed = SeedContents(db);
        var ordersBefore = await db.OfficeOrders.CountAsync();

        // «Пакет» доступен, «Батон» — нет
        var result = await CreateController(db, userId: 5, role: NativeItemsRole)
            .SaveOrder(OrderBody(seed.Own, new DateTime(2030, 1, 10, 12, 0, 0), 3, 1));

        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result.Result).StatusCode);
        Assert.Equal(ordersBefore, await db.OfficeOrders.CountAsync());
    }

    [Fact]
    public async Task SaveOrder_LetsNativeItemsRoleOrderNativeItems()
    {
        using var db = CreateDb();
        var seed = SeedContents(db);

        var result = await CreateController(db, userId: 5, role: NativeItemsRole)
            .SaveOrder(OrderBody(seed.Own, new DateTime(2030, 1, 10, 12, 0, 0), 3));

        var created = Assert.IsType<OrderController.OrderDto>(Assert.IsType<OkObjectResult>(result.Result).Value);
        Assert.Equal([(3, 50d)], await SavedLinesAsync(db, created.Id));
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
