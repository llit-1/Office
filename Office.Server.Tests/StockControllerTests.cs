using System.Net;
using System.Reflection;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Stock;
using Xunit;

namespace Office.Server.Tests;

public class StockControllerTests
{
    private static readonly Guid ShopGuid = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private static readonly Guid StorageGuid = Guid.Parse("c6c585f2-2825-4946-88a7-92ce7c97013c");

    private sealed class FakeWarehouseHandler : HttpMessageHandler
    {
        public List<(HttpMethod Method, string Path, string? Body, string? Token)> Requests { get; } = [];
        public Func<HttpRequestMessage, HttpResponseMessage> Respond { get; set; } = _ => Json("[]");
        public int LoginCount { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.PathAndQuery;
            if (path.EndsWith("/Authorization/login", StringComparison.Ordinal))
            {
                LoginCount++;
                return Json($"\"token-{LoginCount}\"");
            }

            var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add((request.Method, path, body, request.Headers.Authorization?.Parameter));
            return Respond(request);
        }
    }

    private sealed class FakeHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed record Fixture(StockController Controller, FakeWarehouseHandler Handler, RKNETDBContext Db) : IDisposable
    {
        public void Dispose() => Db.Dispose();
    }

    private static HttpResponseMessage Json(string json, HttpStatusCode statusCode = HttpStatusCode.OK) =>
        new(statusCode) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private static Fixture Create(params string[] roles)
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.Locations.Add(new Location { Guid = ShopGuid, Name = "ТТ Ленина", Actual = 1 });
        db.WarehouseHolders.Add(new WarehouseHolder { Id = 7, Surname = "Иванов", Name = "Иван", Actual = 1 });
        db.WarehouseCategories.AddRange(
            new WarehouseCategories { Id = 1, Name = "Техника", Actual = 1 },
            new WarehouseCategories { Id = 2, Name = "Ноутбуки", Parent = 1, Actual = 1 },
            new WarehouseCategories { Id = 3, Name = "Lenovo T14", Parent = 2, Actual = 1 });
        db.SaveChanges();

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["WarehouseApi:BaseUrl"] = "https://warehouse.test/api",
            ["WarehouseApi:Login"] = "service",
            ["WarehouseApi:Password"] = "secret",
        }).Build();

        var handler = new FakeWarehouseHandler();
        var warehouseApi = new WarehouseApiClient(
            new FakeHttpClientFactory(handler),
            new MemoryCache(new MemoryCacheOptions()),
            configuration,
            NullLogger<WarehouseApiClient>.Instance);

        var claims = new List<Claim> { new(ClaimTypes.Name, "ivanov") };
        claims.AddRange(roles.Select(role => new Claim(ClaimTypes.Role, role)));
        var controller = new StockController(db, warehouseApi, configuration)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test")) },
            },
        };

        return new Fixture(controller, handler, db);
    }

    [Theory]
    [InlineData("ФИСВУА", "ABCDEF")]
    [InlineData(" e2 80 11 ", "E28011")]
    [InlineData("E28011700000020F1A2B3C4D", "E28011700000020F1A2B3C4D")]
    public void ObjectCodeIsNormalizedAndPadded(string raw, string expected)
    {
        Assert.True(StockObjectCode.TryNormalize(raw, out var code));
        Assert.Equal(expected.PadLeft(StockObjectCode.Length, '0'), code);
    }

    [Theory]
    [InlineData("")]
    [InlineData("XYZ")]
    [InlineData("E28011700000020F1A2B3C4D0")]
    public void InvalidObjectCodeIsRejected(string raw)
    {
        Assert.False(StockObjectCode.TryNormalize(raw, out _));
    }

    [Fact]
    public void StructureChangesAndWriteOffRequireStockAdmin()
    {
        var adminOnly = new[]
        {
            nameof(StockController.WriteOff),
            nameof(StockController.CreateCategory),
            nameof(StockController.CreateCategoryForm),
            nameof(StockController.UpdateCategory),
            nameof(StockController.UpdateCategoryForm),
            nameof(StockController.DeleteCategory),
            nameof(StockController.ToggleActual),
        };

        foreach (var method in adminOnly)
        {
            var attribute = typeof(StockController).GetMethod(method)!.GetCustomAttribute<AuthorizeAttribute>();
            Assert.Equal(StockRoles.Admin, attribute?.Roles);
        }

        Assert.Equal(StockRoles.Any, typeof(StockController).GetCustomAttribute<AuthorizeAttribute>()!.Roles);
    }

    [Fact]
    public async Task TransferUsesAuthorFromTokenAndSkipsDuplicateCodes()
    {
        using var fixture = Create(StockRoles.User);

        var result = await fixture.Controller.Transfer(new StockTransferRequest
        {
            LocationGuid = ShopGuid,
            HolderId = 7,
            Comment = " Заявка 15 ",
            Items = [new() { Code = "abc" }, new() { Code = "ABC" }, new() { Code = "def", Comment = "Сломан корпус" }],
        }, CancellationToken.None);

        Assert.Equal(2, result.Value!.Count);
        var request = Assert.Single(fixture.Handler.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("/api/transfer/SetObjectHistory", request.Path);
        Assert.Equal("token-1", request.Token);

        using var body = JsonDocument.Parse(request.Body!);
        var rows = body.RootElement.EnumerateArray().ToList();
        Assert.Equal(2, rows.Count);
        Assert.Equal("ABC".PadLeft(24, '0'), rows[0].GetProperty("WarehouseObjectsId").GetString());
        Assert.Equal("ivanov", rows[0].GetProperty("User").GetString());
        Assert.Equal("7", rows[0].GetProperty("NewHolder").GetString());
        Assert.Equal(ShopGuid.ToString(), rows[0].GetProperty("Location").GetString());
        Assert.Equal(2, rows[0].GetProperty("WarehouseAction").GetInt32());
        Assert.Equal("Заявка 15", rows[0].GetProperty("Comment").GetString());
        Assert.Equal("Сломан корпус", rows[1].GetProperty("Comment").GetString());
        Assert.Matches(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$", rows[0].GetProperty("DateTime").GetString());
    }

    [Fact]
    public async Task TransferKeepsDestinationOfEachObject()
    {
        using var fixture = Create(StockRoles.User);
        var secondShop = Guid.Parse("33333333-3333-3333-3333-333333333333");
        fixture.Db.Locations.Add(new Location { Guid = secondShop, Name = "Тестовая ТТ 2", Actual = 1 });
        await fixture.Db.SaveChangesAsync();

        var result = await fixture.Controller.Transfer(new StockTransferRequest
        {
            Comment = "Заявка 15",
            Items =
            [
                new() { Code = "abc", LocationGuid = ShopGuid },
                new() { Code = "def", LocationGuid = secondShop },
            ],
        }, CancellationToken.None);

        Assert.Equal(2, result.Value!.Count);
        using var body = JsonDocument.Parse(Assert.Single(fixture.Handler.Requests).Body!);
        var rows = body.RootElement.EnumerateArray().ToList();
        Assert.Equal(ShopGuid.ToString(), rows[0].GetProperty("Location").GetString());
        Assert.Equal(secondShop.ToString(), rows[1].GetProperty("Location").GetString());
        Assert.Equal(JsonValueKind.Null, rows[1].GetProperty("NewHolder").ValueKind);
    }

    [Fact]
    public async Task TransferRejectsObjectWithoutDestination()
    {
        using var fixture = Create(StockRoles.User);

        var result = await fixture.Controller.Transfer(new StockTransferRequest
        {
            Comment = "Заявка 15",
            Items = [new() { Code = "abc", LocationGuid = ShopGuid }, new() { Code = "def" }],
        }, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Empty(fixture.Handler.Requests);
    }

    [Theory]
    [InlineData(null, "Заявка 15")]
    [InlineData("11111111-1111-1111-1111-111111111111", " ")]
    [InlineData("22222222-2222-2222-2222-222222222222", "Заявка 15")]
    public async Task TransferRejectsIncompleteRequestWithoutCallingWarehouse(string? location, string comment)
    {
        using var fixture = Create(StockRoles.User);

        var result = await fixture.Controller.Transfer(new StockTransferRequest
        {
            LocationGuid = location is null ? null : Guid.Parse(location),
            Comment = comment,
            Items = [new() { Code = "ABC" }],
        }, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result.Result);
        Assert.Empty(fixture.Handler.Requests);
        Assert.Equal(0, fixture.Handler.LoginCount);
    }

    [Fact]
    public async Task SearchFiltersBySelectedLocationsAndMarksStorageItems()
    {
        using var fixture = Create(StockRoles.User);
        fixture.Handler.Respond = _ => Json($$"""
            [{
              "mainCat": { "id": 1, "name": "Техника" },
              "cat": { "id": 2, "name": "Ноутбуки" },
              "secondCat": null,
              "warehouseHolder": null,
              "location": null,
              "items": [
                { "code": "A1", "mainCat": { "name": "Техника" }, "location": { "guid": "{{StorageGuid}}", "name": "Склад" }, "warehouseHolder": null },
                { "code": "A2", "mainCat": { "name": "Техника" }, "location": { "guid": "{{ShopGuid}}", "name": "ТТ Ленина" }, "warehouseHolder": { "surname": "Иванов", "name": "Иван", "patronymic": null } }
              ]
            }]
            """);

        var result = await fixture.Controller.Search(
            new StockSearchRequest { LocationGuids = [StorageGuid], CategoryId = 1 },
            CancellationToken.None);

        var group = Assert.Single(result.Value!);
        var item = Assert.Single(group.Items);
        Assert.Equal("A1", item.Code);
        Assert.True(item.InStorage);

        using var body = JsonDocument.Parse(Assert.Single(fixture.Handler.Requests).Body!);
        Assert.Equal("1", body.RootElement.GetProperty("cathegory").GetString());
        Assert.Equal(1, body.RootElement.GetProperty("actual").GetInt32());
    }

    [Fact]
    public async Task WarehouseTokenIsRefreshedOnceAfterUnauthorized()
    {
        using var fixture = Create(StockRoles.User);
        fixture.Handler.Respond = request => request.Headers.Authorization?.Parameter == "token-1"
            ? new HttpResponseMessage(HttpStatusCode.Unauthorized)
            : Json("""{ "warehouseCategories": { "id": 3, "name": "Lenovo T14" }, "location": { "name": "ТТ Ленина" }, "actual": 1 }""");

        var result = await fixture.Controller.GetObjectSummary("abc", CancellationToken.None);

        Assert.Equal(new[] { "Техника", "Ноутбуки", "Lenovo T14" }, result.Value!.CategoryPath);
        Assert.Equal("Lenovo T14", result.Value.Name);
        Assert.Equal(2, fixture.Handler.LoginCount);
    }

    [Fact]
    public async Task SummaryReportsWrittenOffObjectAsNotFound()
    {
        using var fixture = Create(StockRoles.User);
        fixture.Handler.Respond = _ => Json("""{ "message": "Метка списана" }""", HttpStatusCode.BadRequest);

        var result = await fixture.Controller.GetObjectSummary("ABC", CancellationToken.None);

        Assert.IsType<NotFoundObjectResult>(result.Result);
    }

    [Theory]
    [InlineData(StockRoles.User, false)]
    [InlineData(StockRoles.Admin, true)]
    public async Task CardShowsNewestHistoryFirstAndAllowsWriteOffOnlyForAdmin(string role, bool canWriteOff)
    {
        using var fixture = Create(role);
        fixture.Handler.Respond = _ => Json("""
            [
              { "user": "old", "dateTime": "2024-01-10T09:00:00", "warehouseAction": { "id": 1 },
                "warehouseObjects": { "warehouseCategories": { "id": 3, "name": "Lenovo T14" }, "actual": 1 } },
              { "user": "ivanov", "dateTime": "2024-03-05T12:30:00", "warehouseAction": { "id": 2 }, "location": { "name": "ТТ Ленина" },
                "warehouseObjects": { "warehouseCategories": { "id": 3, "name": "Lenovo T14" }, "actual": 1 } }
            ]
            """);

        var card = (await fixture.Controller.GetObjectCard("abc", CancellationToken.None)).Value!;

        Assert.Equal(canWriteOff, card.CanWriteOff);
        Assert.Equal("Перемещение", card.History[0].ActionName);
        Assert.Equal("Оприходование", card.History[1].ActionName);
    }

    [Fact]
    public async Task WriteOffRequiresReasonAndSendsAuthor()
    {
        using var fixture = Create(StockRoles.Admin);

        Assert.IsType<BadRequestObjectResult>(
            await fixture.Controller.WriteOff("ABC", new StockWriteOffRequest { Comment = "x" }, CancellationToken.None));
        Assert.Empty(fixture.Handler.Requests);

        Assert.IsType<NoContentResult>(
            await fixture.Controller.WriteOff("ABC", new StockWriteOffRequest { Comment = "Разбит экран" }, CancellationToken.None));

        var request = Assert.Single(fixture.Handler.Requests);
        Assert.Equal(HttpMethod.Delete, request.Method);
        using var body = JsonDocument.Parse(request.Body!);
        Assert.Equal("ivanov", body.RootElement.GetProperty("user").GetString());
        Assert.Equal("ABC".PadLeft(24, '0'), body.RootElement.GetProperty("id").GetString());
    }
}
