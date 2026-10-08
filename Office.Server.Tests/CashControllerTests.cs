using System.Net;
using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using System.Text;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Xunit;

namespace Office.Server.Tests;

public class CashControllerTests
{
    private const string ClientsJson =
        """[{"id":8,"name":"Заставская 30","locationGUID":"34170dc4-c6a0-4b67-08b0-08def207acdb","ip":"10.140.31.250","midserver":15608,"cashVersion":1,"lastConnection":"2026-09-17T09:43:10.923","location":null},""" +
        """{"id":9,"name":"Стачек 73","locationGUID":null,"ip":null,"midserver":null,"cashVersion":null,"lastConnection":null,"location":null}]""";

    /// <summary>Отвечает по пути запроса и запоминает всё, что ушло в yeapi.</summary>
    private sealed class FakeCashApi : HttpMessageHandler
    {
        public List<(HttpMethod Method, string PathAndQuery, long? ContentLength)> Requests { get; } = [];
        public List<string> Bodies { get; } = [];
        public Dictionary<string, (HttpStatusCode Status, string Body)> Responses { get; } = [];

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            var path = request.RequestUri!.PathAndQuery;
            Requests.Add((request.Method, path, request.Content?.Headers.ContentLength));
            Bodies.Add(request.Content is null ? string.Empty : await request.Content.ReadAsStringAsync(cancellationToken));
            var (status, body) = Responses.TryGetValue(request.RequestUri.AbsolutePath, out var response)
                ? response
                : (HttpStatusCode.OK, "1");
            return new HttpResponseMessage(status)
            {
                Content = new StringContent(body, Encoding.UTF8, "application/json"),
            };
        }
    }

    private sealed class FakeHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private static (CashController Controller, FakeCashApi Api) Create()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["DeliveryMenuApi:CashUrl"] = "https://yeapi.test/api/cash",
        }).Build();
        var api = new FakeCashApi();
        api.Responses["/api/cash/getcashclients"] = (HttpStatusCode.OK, ClientsJson);
        var controller = new CashController(new FakeHttpClientFactory(api), configuration, NullLogger<CashController>.Instance);
        return (controller, api);
    }

    [Fact]
    public void ParseClients_ReadsNumericVersionAsVersionId()
    {
        var clients = CashController.ParseClients(ClientsJson);

        Assert.Equal(2, clients.Count);
        Assert.Equal(8, clients[0].Id);
        Assert.Equal(1, clients[0].CashVersionId);
        Assert.Null(clients[0].CashVersion);
        Assert.Equal(Guid.Parse("34170dc4-c6a0-4b67-08b0-08def207acdb"), clients[0].LocationGuid);
        Assert.Equal(new DateTime(2026, 9, 17, 9, 43, 10, 923), clients[0].LastConnection);
        Assert.Null(clients[1].CashVersionId);
        Assert.Null(clients[1].LocationGuid);
    }

    [Fact]
    public void ParseLocations_KeepsActualPointsSortedByName()
    {
        var locations = CashController.ParseLocations(
            """[{"guid":"17e747e2-8936-474e-bc8b-03952dde29cc","name":"Чайковского 21","actual":1,"stops":[]},""" +
            """{"guid":"6767ebaa-9833-4a5d-9ed2-02ad654af919","name":"Богатырский 54 ","actual":1},""" +
            """{"guid":"ab9d36fd-c19c-488d-b8e2-079a20a7d267","name":"Закрытая","actual":0}]""");

        Assert.Equal(["Богатырский 54", "Чайковского 21"], locations.Select(x => x.Name));
        Assert.Equal(Guid.Parse("6767ebaa-9833-4a5d-9ed2-02ad654af919"), locations[0].Guid);
    }

    [Fact]
    public async Task GetLocations_ReadsPointsFromYeapi()
    {
        var (controller, api) = Create();
        api.Responses["/api/cash/getlocations"] = (HttpStatusCode.OK, """[{"guid":"17e747e2-8936-474e-bc8b-03952dde29cc","name":"Чайковского 21","actual":1}]""");

        var result = Assert.IsType<OkObjectResult>(await controller.GetLocations(CancellationToken.None));

        var location = Assert.Single(Assert.IsAssignableFrom<IEnumerable<CashController.CashLocationDto>>(result.Value));
        Assert.Equal("Чайковского 21", location.Name);
        Assert.Equal("/api/cash/getlocations", Assert.Single(api.Requests).PathAndQuery);
    }

    [Fact]
    public async Task SendMessage_RejectsPointMissingFromYeapi()
    {
        var (controller, api) = Create();
        api.Responses["/api/cash/getlocations"] = (HttpStatusCode.OK, "[]");

        var result = Assert.IsType<BadRequestObjectResult>(
            await controller.SendMessage(new CashController.CashMessageRequest(Guid.NewGuid(), "Тест"), CancellationToken.None));

        Assert.Contains("недоступна", result.Value!.ToString());
    }

    [Fact]
    public void ParseClients_KeepsTextVersionAsVersionNumber()
    {
        var clients = CashController.ParseClients("""[{"id":3,"cashVersion":"1.4.8.0"}]""");

        Assert.Null(clients[0].CashVersionId);
        Assert.Equal("1.4.8.0", clients[0].CashVersion);
    }

    [Fact]
    public void ParseTasks_ReadsYeapiTaskShape()
    {
        var task = CashController.ParseTasks(9, """{"id":5,"cashId":9,"type":"Update","stage":"Created","cashVersionId":7,"stageChanged":"2026-09-17T11:53:54.897"}""").Single();

        Assert.Equal(new CashController.CashTaskDto(9, 5, "Update", "Created", 7, "2026-09-17T11:53:54.897"), task);
    }

    [Fact]
    public void ParseTasks_AcceptsObjectOrArray()
    {
        var single = CashController.ParseTasks(8, """{"id":12,"type":"Update","stage":"Extracting","versionId":3}""");
        var many = CashController.ParseTasks(8, """[{"id":12,"type":"Install","stage":"Completed"},{"id":13,"type":"Delete","stage":null}]""");

        Assert.Equal(new CashController.CashTaskDto(8, 12, "Update", "Extracting", 3, null), single.Single());
        Assert.Equal([12, 13], many.Select(x => x.Id));
        Assert.Null(many[1].Stage);
    }

    [Theory]
    [InlineData("Некорректный тип задания.", "Некорректный тип задания.")]
    [InlineData("""{"title":"Not Found","status":404}""", "Not Found")]
    [InlineData("<html>Length Required</html>", "")]
    [InlineData("", "")]
    public void ReadableError_ExtractsServiceMessage(string body, string expected)
    {
        Assert.Equal(expected, CashController.ReadableError(body));
    }

    [Fact]
    public async Task InstallOnClient_QueuesUpdateWithSelectedVersionAndEmptyBody()
    {
        var (controller, api) = Create();

        var result = await controller.InstallOnClient(8, 3, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        var request = Assert.Single(api.Requests);
        Assert.Equal(HttpMethod.Post, request.Method);
        Assert.Equal("/api/cash/task?cashId=8&type=Update&versionId=3", request.PathAndQuery);
        // IIS перед yeapi отвечает 411 на POST без Content-Length.
        Assert.Equal(0, request.ContentLength);
    }

    [Fact]
    public async Task AddVersion_MarksNewVersionActualByDefault()
    {
        var (controller, api) = Create();
        using var stream = new MemoryStream([1, 2, 3]);
        var form = new CashController.CashVersionForm
        {
            Version = "1.4",
            File = new FormFile(stream, 0, stream.Length, "file", "CashClient.zip"),
        };

        var result = await controller.AddVersion(form, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        var body = Assert.Single(api.Bodies);
        Assert.Matches(@"name=actual\s+1", body);
    }

    [Fact]
    public async Task DeleteFromClient_QueuesDeleteTask()
    {
        var (controller, api) = Create();

        var result = await controller.DeleteFromClient(8, CancellationToken.None);

        Assert.IsType<NoContentResult>(result);
        Assert.Equal("/api/cash/task?cashId=8&type=Delete", Assert.Single(api.Requests).PathAndQuery);
    }

    [Fact]
    public async Task DeleteFromClient_ReturnsServiceReason()
    {
        var (controller, api) = Create();
        api.Responses["/api/cash/task"] = (HttpStatusCode.NotFound, "Касса не найдена.");

        var result = Assert.IsType<ObjectResult>(await controller.DeleteFromClient(8, CancellationToken.None));

        Assert.Equal(StatusCodes.Status502BadGateway, result.StatusCode);
        Assert.Contains("Касса не найдена.", result.Value!.ToString());
    }

    [Fact]
    public async Task InstallVersion_QueuesSelectedVersionForEveryRegister()
    {
        var (controller, api) = Create();

        var result = Assert.IsType<OkObjectResult>(await controller.InstallVersion(3, CancellationToken.None));

        Assert.Equal(
            ["/api/cash/task?cashId=8&type=Update&versionId=3", "/api/cash/task?cashId=9&type=Update&versionId=3"],
            api.Requests.Where(x => x.Method == HttpMethod.Post).Select(x => x.PathAndQuery));
        Assert.Contains("queued = 2", result.Value!.ToString());
    }

    [Fact]
    public async Task GetClientTasks_ReturnsLatestTaskAndTreatsNotFoundAsNoTask()
    {
        var (controller, api) = Create();
        api.Responses["/api/cash/task/8"] = (HttpStatusCode.OK, """[{"id":20,"type":"Install","stage":"Completed"},{"id":21,"type":"Update","stage":"Downloading","versionId":3}]""");
        api.Responses["/api/cash/task/9"] = (HttpStatusCode.NotFound, """{"title":"Not Found"}""");

        var result = Assert.IsType<OkObjectResult>(await controller.GetClientTasks(CancellationToken.None));

        var task = Assert.Single(Assert.IsAssignableFrom<IEnumerable<CashController.CashTaskDto>>(result.Value));
        Assert.Equal(new CashController.CashTaskDto(8, 21, "Update", "Downloading", 3, null), task);
    }

    [Theory]
    [InlineData(nameof(CashController.GetLocations), "MenuAuditor")]
    [InlineData(nameof(CashController.SendMessage), "MenuAuditor")]
    [InlineData(nameof(CashController.GetVersions), "CashUpdate")]
    [InlineData(nameof(CashController.AddVersion), "CashUpdate")]
    [InlineData(nameof(CashController.DeleteVersion), "CashUpdate")]
    [InlineData(nameof(CashController.DownloadVersion), "CashUpdate")]
    [InlineData(nameof(CashController.GetClients), "CashUpdate")]
    [InlineData(nameof(CashController.GetClientTasks), "CashUpdate")]
    [InlineData(nameof(CashController.InstallVersion), "CashUpdate")]
    [InlineData(nameof(CashController.InstallOnClient), "CashUpdate")]
    [InlineData(nameof(CashController.DeleteFromClient), "CashUpdate")]
    public void Actions_RequireTheirSectionRole(string action, string role)
    {
        // атрибуты складываются: роль контроллера ограничила бы все действия сразу
        var controllerRoles = typeof(CashController).GetCustomAttributes<AuthorizeAttribute>().Select(x => x.Roles);
        Assert.All(controllerRoles, Assert.Null);

        var method = typeof(CashController).GetMethod(action)!;
        var attribute = Assert.Single(method.GetCustomAttributes<AuthorizeAttribute>());
        Assert.Equal(role, attribute.Roles);
    }
}
