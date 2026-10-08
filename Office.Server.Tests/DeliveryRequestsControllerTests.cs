using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Xunit;

namespace Office.Server.Tests;

public class DeliveryRequestsControllerTests
{
    private const int UserId = 5;
    private static readonly Guid ShopGuid = Guid.NewGuid();
    private static readonly Guid NoDeliveryShopGuid = Guid.NewGuid();
    private static readonly Guid TradePointType = Guid.Parse("94AD659C-AF5B-4CA0-50AD-08DBDF6ABE84");

    private sealed class FakeYandexHandler : HttpMessageHandler
    {
        public List<(string Path, string Body)> Requests { get; } = [];
        public HttpStatusCode StatusCode { get; set; } = HttpStatusCode.OK;
        public string ResponseBody { get; set; } = "{\"blocks\":[]}";
        public string ResponseContentType { get; set; } = "application/json";

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Requests.Add((
                request.RequestUri!.AbsolutePath,
                request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken)));

            return new HttpResponseMessage(StatusCode)
            {
                Content = new StringContent(ResponseBody, Encoding.UTF8, ResponseContentType),
            };
        }
    }

    private sealed class FakeHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed record Fixture(DeliveryRequestsController Controller, FakeYandexHandler Handler, RKNETDBContext Db) : IDisposable
    {
        public void Dispose() => Db.Dispose();
    }

    private static Fixture Create()
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.Locations.Add(new Location
        {
            Guid = ShopGuid,
            Name = "Пекарня на Лесной",
            Actual = 1,
            LocationTypeGuid = TradePointType,
            AggregatorsCode = 321,
            Delivery = 1,
        });
        // Точка без доставки: на вкладке «Запросы» её быть не должно.
        db.Locations.Add(new Location
        {
            Guid = NoDeliveryShopGuid,
            Name = "Пекарня без доставки",
            Actual = 1,
            LocationTypeGuid = TradePointType,
            Delivery = 0,
        });
        db.OfficeUser.Add(new OfficeUser
        {
            Id = UserId,
            Login = "ivanov",
            Surname = "Иванов",
            Name = "Иван",
            Actual = 1,
            DefaultLocations = 1,
        });
        db.SaveChanges();

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["DeliveryMenuApi:YandexUrl"] = "https://yeapi.test/yandex",
        }).Build();

        var handler = new FakeYandexHandler();
        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, "ivanov"),
            new(ClaimTypes.NameIdentifier, UserId.ToString()),
            new(ClaimTypes.Role, "DeliveryRequests"),
        };
        var controller = new DeliveryRequestsController(
            db,
            new FakeHttpClientFactory(handler),
            configuration,
            NullLogger<DeliveryRequestsController>.Instance)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test")) },
            },
        };

        return new Fixture(controller, handler, db);
    }

    private static BlockRequest ValidBlock() => new()
    {
        LocationGuid = ShopGuid,
        From = new DateTime(2026, 9, 16, 10, 0, 0),
        To = new DateTime(2026, 9, 16, 18, 30, 0),
        Message = "  Ремонт печи  ",
    };

    [Fact]
    public async Task BlockForwardsTrimmedPayloadWithSecondsInPeriod()
    {
        using var fixture = Create();

        var result = await fixture.Controller.Block(ValidBlock(), CancellationToken.None);

        Assert.IsType<ContentResult>(result);
        var (path, body) = Assert.Single(fixture.Handler.Requests);
        Assert.Equal("/yandex/block", path);
        using var payload = JsonDocument.Parse(body);
        Assert.Equal(ShopGuid, payload.RootElement.GetProperty("locationGuid").GetGuid());
        // Введено по Москве (10:00–18:30), Яндекс считает время UTC — отправляем на 3 часа раньше.
        Assert.Equal("2026-09-16T07:00:00", payload.RootElement.GetProperty("from").GetString());
        Assert.Equal("2026-09-16T15:30:00", payload.RootElement.GetProperty("to").GetString());
        Assert.Equal("Ремонт печи", payload.RootElement.GetProperty("message").GetString());
        // Тег проставляет yeapi — мы его не передаём.
        Assert.False(payload.RootElement.TryGetProperty("tag", out _));
    }

    [Theory]
    [InlineData("menu")]
    [InlineData("menu_stop_list")]
    public async Task MenuImportForwardsKnownOperationTypes(string operationType)
    {
        using var fixture = Create();

        var result = await fixture.Controller.MenuImport(new MenuImportRequest { LocationGuid = ShopGuid, OperationType = operationType }, CancellationToken.None);

        Assert.IsType<ContentResult>(result);
        var (path, body) = Assert.Single(fixture.Handler.Requests);
        Assert.Equal("/yandex/menu/import", path);
        using var payload = JsonDocument.Parse(body);
        Assert.Equal(operationType, payload.RootElement.GetProperty("operationType").GetString());
    }

    [Fact]
    public async Task MenuImportRejectsUnknownOperationType()
    {
        using var fixture = Create();

        var result = await fixture.Controller.MenuImport(new MenuImportRequest { LocationGuid = ShopGuid, OperationType = "drop_everything" }, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Empty(fixture.Handler.Requests);
    }

    [Fact]
    public async Task ShowsAndAcceptsOnlyLocationsWithDelivery()
    {
        using var fixture = Create();

        var locations = Assert.IsAssignableFrom<IEnumerable<DeliveryRequestLocationDto>>(
            Assert.IsType<OkObjectResult>((await fixture.Controller.GetLocations(CancellationToken.None)).Result).Value);
        Assert.Equal([ShopGuid], locations.Select(x => x.Guid));

        var block = ValidBlock();
        block.LocationGuid = NoDeliveryShopGuid;
        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(await fixture.Controller.Block(block, CancellationToken.None)).StatusCode);
        var import = await fixture.Controller.MenuImport(new MenuImportRequest { LocationGuid = NoDeliveryShopGuid, OperationType = "menu" }, CancellationToken.None);
        Assert.Equal(StatusCodes.Status404NotFound, Assert.IsType<ObjectResult>(import).StatusCode);
        Assert.Empty(fixture.Handler.Requests);
    }

    [Fact]
    public async Task SalesLoadForwardsCalendarDateWithoutShift()
    {
        using var fixture = Create();

        var result = await fixture.Controller.SalesLoad(new SalesLoadRequest { Date = new DateTime(2026, 9, 15, 17, 45, 0) }, CancellationToken.None);

        Assert.IsType<ContentResult>(result);
        var (path, body) = Assert.Single(fixture.Handler.Requests);
        Assert.Equal("/yandex/sales/load", path);
        using var payload = JsonDocument.Parse(body);
        Assert.Equal("2026-09-15T00:00:00", payload.RootElement.GetProperty("date").GetString());
    }

    [Fact]
    public async Task SalesLoadRejectsFutureDate()
    {
        using var fixture = Create();

        var result = await fixture.Controller.SalesLoad(new SalesLoadRequest { Date = DateTime.Today.AddDays(1) }, CancellationToken.None);

        Assert.IsType<BadRequestObjectResult>(result);
        Assert.Empty(fixture.Handler.Requests);
    }

    [Fact]
    public async Task BlockRejectsMissingReasonAndForeignLocation()
    {
        using var fixture = Create();

        var withoutMessage = ValidBlock();
        withoutMessage.Message = "   ";
        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.Block(withoutMessage, CancellationToken.None));

        var foreign = ValidBlock();
        foreign.LocationGuid = Guid.NewGuid();
        var foreignResult = Assert.IsType<ObjectResult>(await fixture.Controller.Block(foreign, CancellationToken.None));
        Assert.Equal(StatusCodes.Status404NotFound, foreignResult.StatusCode);

        var backwards = ValidBlock();
        backwards.To = backwards.From.AddHours(-1);
        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.Block(backwards, CancellationToken.None));

        Assert.Empty(fixture.Handler.Requests);
    }

    [Fact]
    public async Task UnblockNeedsIdsAndSendsThemOnce()
    {
        using var fixture = Create();

        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.Unblock(
            new UnblockRequest { LocationGuid = ShopGuid, BlockIds = ["  "] }, CancellationToken.None));

        var result = await fixture.Controller.Unblock(
            new UnblockRequest { LocationGuid = ShopGuid, BlockIds = [" b-1 ", "b-2", "b-1"] }, CancellationToken.None);

        Assert.IsType<ContentResult>(result);
        var (path, body) = Assert.Single(fixture.Handler.Requests);
        Assert.Equal("/yandex/unblock", path);
        using var payload = JsonDocument.Parse(body);
        Assert.Equal(new[] { "b-1", "b-2" }, payload.RootElement.GetProperty("blockIds").EnumerateArray().Select(x => x.GetString()));
    }

    [Fact]
    public async Task ServiceErrorKeepsYandexMessageAndNonJsonAnswerIsWrapped()
    {
        using var fixture = Create();
        fixture.Handler.StatusCode = HttpStatusCode.BadRequest;
        fixture.Handler.ResponseBody = "{\"message\":\"Ресторан уже заблокирован\"}";

        var failure = Assert.IsType<ObjectResult>(await fixture.Controller.Block(ValidBlock(), CancellationToken.None));
        Assert.Equal(StatusCodes.Status400BadRequest, failure.StatusCode);
        var message = failure.Value!.GetType().GetProperty("message")!.GetValue(failure.Value) as string;
        Assert.Contains("уже заблокирован", message);

        fixture.Handler.StatusCode = HttpStatusCode.OK;
        fixture.Handler.ResponseBody = "Служба на обслуживании";
        fixture.Handler.ResponseContentType = "text/plain";

        var wrapped = Assert.IsType<ContentResult>(await fixture.Controller.Block(ValidBlock(), CancellationToken.None));
        using var content = JsonDocument.Parse(wrapped.Content!);
        Assert.Equal("Служба на обслуживании", content.RootElement.GetProperty("raw").GetString());
    }

    [Fact]
    public async Task OrdersHistoryValidatesPagingAndListsOnlyAllowedLocations()
    {
        using var fixture = Create();

        var tooMany = new OrdersHistoryRequest
        {
            LocationGuid = ShopGuid,
            From = new DateTime(2026, 9, 1),
            To = new DateTime(2026, 9, 2),
            Limit = 5000,
        };
        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.OrdersHistory(tooMany, CancellationToken.None));

        var locations = (await fixture.Controller.GetLocations(CancellationToken.None)).Result as OkObjectResult;
        var items = Assert.IsAssignableFrom<IReadOnlyList<DeliveryRequestLocationDto>>(locations!.Value);
        Assert.Equal(ShopGuid, Assert.Single(items).Guid);
    }
}
