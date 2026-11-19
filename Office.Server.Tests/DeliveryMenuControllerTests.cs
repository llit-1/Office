using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Xunit;

namespace Office.Server.Tests;

public class DeliveryMenuControllerTests
{
    // Внешний itemmanager: запоминает запросы с телами и отвечает 200.
    private sealed class FakeItemManager : HttpMessageHandler
    {
        public List<(HttpMethod Method, string Path, string? Body)> Requests { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            Requests.Add((request.Method, request.RequestUri!.AbsolutePath, body));
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("{}", Encoding.UTF8, "application/json"),
            };
        }
    }

    private sealed class FakeHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static (DeliveryMenuController Controller, FakeItemManager Api) Create()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["DeliveryMenuApi:BaseUrl"] = "https://yeapi.test/itemmanager",
        }).Build();
        var api = new FakeItemManager();
        var controller = new DeliveryMenuController(
            new FakeHttpClientFactory(api),
            configuration,
            NullLogger<DeliveryMenuController>.Instance);
        return (controller, api);
    }

    private const string ItemWithoutDeclaration =
        """{"rkcode":202,"yeGroup":10,"rkName":"Пепперони","yeName":"Пепперони","description":"Колбаса и сыр","price":600,"measure":450,"measureUnit":"г","imageHash":"","actual":1,"image":"aW1n","stops":[],"declaration":null,"tnvedCode":null}""";

    private static void AssertDeclarationIsNull(string? forwardedBody)
    {
        Assert.NotNull(forwardedBody);
        using var json = JsonDocument.Parse(forwardedBody!);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("declaration").ValueKind);
        Assert.Equal(JsonValueKind.Null, json.RootElement.GetProperty("tnvedCode").ValueKind);
        Assert.Equal(202, json.RootElement.GetProperty("rkcode").GetInt32());
    }

    [Fact]
    public async Task CreateItem_AcceptsItemWithoutDeclaration_AndForwardsNull()
    {
        var (controller, api) = Create();
        using var body = JsonDocument.Parse(ItemWithoutDeclaration);

        var result = await controller.CreateItem(body.RootElement, CancellationToken.None);

        var content = Assert.IsType<ContentResult>(result);
        Assert.Equal(StatusCodes200, content.StatusCode);
        var request = Assert.Single(api.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("/itemmanager/item", request.Path);
        AssertDeclarationIsNull(request.Body);
    }

    [Fact]
    public async Task UpdateItem_AcceptsItemWithoutDeclaration_AndForwardsNull()
    {
        var (controller, api) = Create();
        using var body = JsonDocument.Parse(ItemWithoutDeclaration);

        var result = await controller.UpdateItem(202, body.RootElement, CancellationToken.None);

        var content = Assert.IsType<ContentResult>(result);
        Assert.Equal(StatusCodes200, content.StatusCode);
        var request = Assert.Single(api.Requests);
        Assert.Equal(HttpMethod.Put, request.Method);
        Assert.Equal("/itemmanager/items/202", request.Path);
        AssertDeclarationIsNull(request.Body);
    }

    private const int StatusCodes200 = 200;
}
