using System.Net;
using System.Security.Claims;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Xunit;

namespace Office.Server.Tests;

public class DeliveryStopsControllerTests
{
    private const int UserId = 7;
    private static readonly Guid ShopGuid = Guid.Parse("34170dc4-c6a0-4b67-08b0-08def207acdb");
    private static readonly Guid TradePointType = Guid.Parse("94AD659C-AF5B-4CA0-50AD-08DBDF6ABE84");

    // справочник R-Keeper: булочка 832608 есть только здесь, бриошь 832518 - и в меню доставки
    private const string ReferenceJson =
        """{"categories":[{"code":3,"name":"Выпечка","categories":[],"items":[{"code":832608,"name":"Булочка Неаполитанская","price":12500},{"code":832518,"name":"Бриошь с изюмом","price":9900}]}]}""";

    private sealed class FakeYeapi : HttpMessageHandler
    {
        public List<(HttpMethod Method, string Path)> Requests { get; } = [];
        public Dictionary<string, (HttpStatusCode Status, string Body)> Responses { get; } = new(StringComparer.OrdinalIgnoreCase)
        {
            ["/itemmanager/getmenu"] = (HttpStatusCode.OK, ReferenceJson),
            ["/itemmanager/getallgroups"] = (HttpStatusCode.OK, """[{"id":10,"yaName":"Выпечка","actual":1,"image":"AAAA"}]"""),
            ["/itemmanager/groups/10/items"] = (HttpStatusCode.OK, """[{"rkcode":832518,"yeName":"Бриошь","image":"BBBB"}]"""),
            ["/api/stop"] = (HttpStatusCode.OK, "[]"),
            ["/api/stop/204"] = (HttpStatusCode.OK, ""),
        };

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.AbsolutePath;
            Requests.Add((request.Method, path));
            var (status, body) = Responses.TryGetValue(path, out var response) ? response : (HttpStatusCode.NotFound, "");
            return Task.FromResult(new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            });
        }
    }

    private sealed class FakeHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static (DeliveryStopsController Controller, FakeYeapi Api) Create()
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.Locations.Add(new Location { Guid = ShopGuid, Name = "Заставская 30", Actual = 1, LocationTypeGuid = TradePointType });
        db.OfficeUser.Add(new OfficeUser { Id = UserId, Login = "kurguzov", Surname = "Кургузов", Name = "Владислав", Actual = 1, DefaultLocations = 1 });
        db.SaveChanges();

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["DeliveryMenuApi:BaseUrl"] = "https://yeapi.test/itemmanager",
            ["DeliveryMenuApi:StopUrl"] = "https://yeapi.test/api/stop",
        }).Build();

        var api = new FakeYeapi();
        var claims = new List<Claim>
        {
            new(ClaimTypes.Name, "kurguzov"),
            new(ClaimTypes.NameIdentifier, UserId.ToString()),
            new(ClaimTypes.Role, "MenuAuditor"),
        };
        var controller = new DeliveryStopsController(
            db,
            new FakeHttpClientFactory(api),
            configuration,
            NullLogger<DeliveryStopsController>.Instance,
            new MemoryCache(new MemoryCacheOptions()))
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity(claims, "Test")) },
            },
        };
        return (controller, api);
    }

    private static StopPackRequest LocationPack(params int[] items) => new(
        null,
        null,
        ShopGuid,
        "Заставская 30",
        DateTime.Now.AddMinutes(5),
        DateTime.Today.AddDays(1),
        1,
        items.Select(x => new StopRequest(null, x)).ToList());

    [Fact]
    public async Task CreateStopPack_ForbidsQuickStopForAuditorWithoutEmployeeRole()
    {
        // Create() — пользователь только с ролью MenuAuditor: «Стопы (Яндекс)» (уровень 2) ему недоступны.
        var (controller, api) = Create();
        var quickStop = new StopPackRequest(
            832518,
            "Хала",
            null,
            null,
            DateTime.Now,
            DateTime.Today.AddDays(1),
            2,
            [new StopRequest(ShopGuid, 832518)]);

        var result = await controller.CreateStopPack(quickStop, CancellationToken.None);

        Assert.IsType<ForbidResult>(result);
        Assert.DoesNotContain(api.Requests, x => x.Method == HttpMethod.Post);
    }

    [Fact]
    public async Task GetStopItems_OffersWholeReferenceMenu()
    {
        var (controller, _) = Create();

        var result = Assert.IsType<OkObjectResult>((await controller.GetStopItems(CancellationToken.None)).Result);

        var codes = Assert.IsAssignableFrom<IEnumerable<StopMenuItemDto>>(result.Value).Select(x => x.Rkcode);
        Assert.Equal([832518, 832608], codes.Order());
    }

    [Fact]
    public async Task UpdateStopPack_SendsPackWithDeliveryMenuItems()
    {
        var (controller, api) = Create();

        var result = await controller.UpdateStopPack(204, LocationPack(832518), CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        Assert.Contains(api.Requests, x => x.Method == HttpMethod.Put && x.Path == "/api/stop/204");
    }

    [Fact]
    public async Task UpdateStopPack_LeavesDecisionToServiceWhenMenuIsUnavailable()
    {
        var (controller, api) = Create();
        api.Responses["/itemmanager/getallgroups"] = (HttpStatusCode.BadGateway, "");

        var result = await controller.UpdateStopPack(204, LocationPack(832608), CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        Assert.Contains(api.Requests, x => x.Method == HttpMethod.Put);
    }
}
