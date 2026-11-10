using System.Net;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Office.Server.DbContexts.RK7;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Locations;
using Office.Server.Nx;
using Xunit;

namespace Office.Server.Tests;

public class TTControllerTradePointTests
{
    private static readonly Guid BakeryType = Guid.Parse("94AD659C-AF5B-4CA0-50AD-08DBDF6ABE84");
    private static readonly Guid OfficeType = Guid.Parse("3810B715-2164-4524-F182-08DBF1A777FF");
    private static readonly Guid EntityGuid = Guid.NewGuid();
    private static readonly Guid OtherEntityGuid = Guid.NewGuid();

    /// <summary>Поддельный сервер NX: вход, группы пользователей и создание группы.</summary>
    private sealed class FakeNx : HttpMessageHandler, IHttpClientFactory
    {
        public List<(Guid Id, string Name)> Groups { get; } = [];
        /// <summary>Пользователи NX и группы, в которых они состоят.</summary>
        public Dictionary<string, List<string>> Users { get; } = [];
        public bool Down { get; set; }
        public int Created { get; private set; }

        public HttpClient CreateClient(string name) => new(this, disposeHandler: false);

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            if (Down) throw new HttpRequestException("NX недоступен");
            var path = request.RequestUri!.AbsolutePath;
            if (path == "/rest/v1/login/sessions") return Json("{\"token\":\"t\"}");
            if (path.StartsWith("/rest/v4/users"))
            {
                var login = Uri.UnescapeDataString(path["/rest/v4/users".Length..].TrimStart('/'));
                if (request.Method == HttpMethod.Patch)
                {
                    var body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!;
                    Users[login] = body["groupIds"]!.AsArray().Select(id => id!.ToString()).ToList();
                    return Json("{}");
                }

                return login.Length == 0
                    ? Json(new JsonArray(Users.Keys.Select(user => (JsonNode)ToUser(user)).ToArray()).ToJsonString())
                    : Json(ToUser(login).ToJsonString());
            }

            if (request.Method == HttpMethod.Post)
            {
                var body = JsonNode.Parse(await request.Content!.ReadAsStringAsync(cancellationToken))!;
                var group = (Guid.NewGuid(), body["name"]!.ToString());
                Groups.Add(group);
                Created++;
                return Json(ToJson(group).ToJsonString());
            }

            return Json(new JsonArray(Groups.Select(group => (JsonNode)ToJson(group)).ToArray()).ToJsonString());
        }

        private static JsonObject ToJson((Guid Id, string Name) group) =>
            new() { ["id"] = group.Id.ToString(), ["name"] = group.Name };

        private JsonObject ToUser(string login) => new()
        {
            ["id"] = login,
            ["name"] = login,
            ["groupIds"] = new JsonArray(Users[login].Select(id => (JsonNode)JsonValue.Create(id)!).ToArray()),
        };

        private static HttpResponseMessage Json(string body) =>
            new(HttpStatusCode.OK) { Content = new StringContent(body, Encoding.UTF8, "application/json") };
    }

    private sealed record Fixture(TTController Controller, RKNETDBContext Db, Rk7Context Rk7, FakeNx Nx) : IDisposable
    {
        public void Dispose()
        {
            Db.Dispose();
            Rk7.Dispose();
        }
    }

    private static Fixture Create()
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.LocationTypes.AddRange(
            new LocationType { Guid = BakeryType, Name = "Пекарня" },
            new LocationType { Guid = OfficeType, Name = "Офис" });
        db.Entity.AddRange(
            new Entity { Guid = EntityGuid, Name = "ООО Хлеб", Owner = 1 },
            new Entity { Guid = OtherEntityGuid, Name = "ООО Ромашка", Owner = 1 });
        db.SaveChanges();

        var rk7 = new Rk7Context(new DbContextOptionsBuilder<Rk7Context>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        rk7.Restaurants.AddRange(
            new Rk7Restaurant { Sifr = 1001, Code = 1, Name = " Люди Любят, Невский  96 ", Status = 3 },
            new Rk7Restaurant { Sifr = 1002, Code = 2, Name = "ЛюдиЛюбят, Лесной 20", Status = 3 },
            new Rk7Restaurant { Sifr = 1003, Code = 3, Name = "Удалённая", Status = 0 },
            new Rk7Restaurant { Sifr = 1004, Code = 4, Name = "Закрытая", Status = 2 });
        rk7.SaveChanges();

        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["NxRest:Host"] = "nx.test",
            ["NxRest:Port"] = "7001",
            ["NxRest:Username"] = "user",
            ["NxRest:Password"] = "password",
        }).Build();
        var nx = new FakeNx();
        var controller = new TTController(
            db,
            rk7,
            new EntityFolderService(configuration, NullLogger<EntityFolderService>.Instance),
            new NxRestClient(nx, configuration),
            new NxUserSyncService(new NxRestClient(nx, configuration), db, NullLogger<NxUserSyncService>.Instance),
            NullLogger<TTController>.Instance);
        return new Fixture(controller, db, rk7, nx);
    }

    /// <summary>ТТ с группой NX, сотрудник с ролью NX и он же в группе этой ТТ на стороне NX.</summary>
    private static async Task<(Location Point, Guid OldGroup, Guid NewGroup)> PointWithNxUser(Fixture fixture)
    {
        await fixture.Controller.Create(NewPoint(1001, 555));
        var point = Assert.Single(fixture.Db.Locations);
        var oldGroup = point.NXLayout!.Value;
        var newGroup = Guid.NewGuid();
        fixture.Nx.Groups.Add((newGroup, "Невский новая"));

        var group = new OfficeGroup { ID = 1, Name = "Видео" };
        group.OfficeRole.Add(new OfficeRole { ID = 1, Name = "NX - Видеонаблюдение", Role = NxUserSyncService.RoleCode });
        var user = new OfficeUser { Id = 7, Login = "petrov", Actual = 1 };
        user.OfficeGroup.Add(group);
        user.Locations.Add(point);
        fixture.Db.OfficeUser.Add(user);
        fixture.Db.SaveChanges();
        fixture.Db.ChangeTracker.Clear();

        fixture.Nx.Users["petrov"] = [oldGroup.ToString()];
        return (point, oldGroup, newGroup);
    }

    private static TTController.TTUpdateRequest WithLayout(Guid? layout) => new()
    {
        NxLayout = layout,
        LocationTypeGuid = BakeryType,
        VersionStartDate = new DateTime(2026, 10, 1),
    };

    [Fact]
    public async Task ChangingNxGroupMovesPointUsersToIt()
    {
        using var fixture = Create();
        var (point, oldGroup, newGroup) = await PointWithNxUser(fixture);

        Assert.IsType<NoContentResult>(await fixture.Controller.Update(point.Guid, WithLayout(newGroup)));

        Assert.Equal([newGroup.ToString()], fixture.Nx.Users["petrov"]);
        Assert.DoesNotContain(oldGroup.ToString(), fixture.Nx.Users["petrov"]);
        Assert.Equal(newGroup, fixture.Db.Locations.AsNoTracking().Single().NXLayout);
    }

    [Fact]
    public async Task UnlinkingNxGroupRemovesItFromPointUsers()
    {
        using var fixture = Create();
        var (point, _, _) = await PointWithNxUser(fixture);

        Assert.IsType<NoContentResult>(await fixture.Controller.Update(point.Guid, WithLayout(null)));

        Assert.Empty(fixture.Nx.Users["petrov"]);
        Assert.Null(fixture.Db.Locations.AsNoTracking().Single().NXLayout);
    }

    [Fact]
    public async Task NxGroupStaysWhenUsersCouldNotBeMoved()
    {
        using var fixture = Create();
        var (point, oldGroup, newGroup) = await PointWithNxUser(fixture);
        fixture.Nx.Down = true;

        var result = Assert.IsType<ObjectResult>(await fixture.Controller.Update(point.Guid, WithLayout(newGroup)));

        Assert.Equal(StatusCodes.Status503ServiceUnavailable, result.StatusCode);
        Assert.Equal(oldGroup, fixture.Db.Locations.AsNoTracking().Single().NXLayout);
    }

    [Fact]
    public async Task UnchangedNxGroupDoesNotCallNx()
    {
        using var fixture = Create();
        var (point, oldGroup, _) = await PointWithNxUser(fixture);
        fixture.Nx.Down = true;

        Assert.IsType<NoContentResult>(await fixture.Controller.Update(point.Guid, WithLayout(oldGroup)));
    }

    private static TTController.TTCreateRequest NewPoint(int rkCode, int obd) => new()
    {
        RKCode = rkCode,
        Obd = obd,
        AltName = " Невский ",
        LocationTypeGuid = BakeryType,
        EntityGuid = EntityGuid,
        VersionStartDate = new DateTime(2026, 10, 1, 15, 30, 0),
    };

    [Fact]
    public async Task OffersOnlyRestaurantsMissingFromLocations()
    {
        using var fixture = Create();
        fixture.Db.Locations.Add(new Location { Guid = Guid.NewGuid(), Name = "Пекарня, Лесной 20", RKCode = 1002, Actual = 1 });
        fixture.Db.SaveChanges();

        var result = Assert.IsType<OkObjectResult>((await fixture.Controller.GetCreateLookups()).Result);
        var lookups = Assert.IsType<TTController.TTCreateLookupsDto>(result.Value);

        Assert.Equal([1001, 1004, 1003], lookups.Restaurants.Select(x => x.RKCode));
        Assert.Equal("Невский 96", lookups.Restaurants[0].Name);
        Assert.Equal((short)0, lookups.Restaurants[2].Status);
        Assert.Equal([BakeryType], lookups.LocationTypes.Select(x => x.Guid));
        Assert.Equal([OtherEntityGuid, EntityGuid], lookups.Entities.Select(x => x.Guid));
    }

    [Fact]
    public async Task CreatesPointWithNameFromRk7AndFirstObdVersion()
    {
        using var fixture = Create();

        Assert.IsType<OkObjectResult>(await fixture.Controller.Create(NewPoint(1001, 555)));

        var location = Assert.Single(fixture.Db.Locations);
        Assert.Equal("Невский 96", location.Name);
        Assert.Equal("Невский", location.AltName);
        Assert.Equal(1001, location.RKCode);
        var version = Assert.Single(fixture.Db.LocationVersions);
        Assert.Equal(EntityGuid, version.EntityGuid);
        Assert.Equal(555, version.OBD);
        Assert.Equal("Невский 96", version.Name);
        var requisite = Assert.Single(fixture.Db.OfficeLocationRequisites);
        Assert.Equal(555, requisite.Obd);
        Assert.Equal(EntityGuid, requisite.EntityGuid);
        Assert.Equal(new DateTime(2026, 10, 1), requisite.Begin);
        Assert.Null(requisite.End);
    }

    [Fact]
    public async Task NewPointGetsNxGroupByNameOrANewOne()
    {
        using var fixture = Create();
        var existing = Guid.NewGuid();
        fixture.Nx.Groups.Add((existing, "лесной 20"));

        Assert.IsType<OkObjectResult>(await fixture.Controller.Create(NewPoint(1002, 555)));
        Assert.Equal(existing, fixture.Db.Locations.Single(x => x.RKCode == 1002).NXLayout);
        Assert.Equal(0, fixture.Nx.Created);

        Assert.IsType<OkObjectResult>(await fixture.Controller.Create(NewPoint(1001, 556)));
        Assert.Equal(1, fixture.Nx.Created);
        Assert.Equal("Невский 96", fixture.Nx.Groups[1].Name);
        Assert.Equal(fixture.Nx.Groups[1].Id, fixture.Db.Locations.Single(x => x.RKCode == 1001).NXLayout);
    }

    [Fact]
    public async Task NxGroupBelongsToOnePoint()
    {
        using var fixture = Create();
        await fixture.Controller.Create(NewPoint(1001, 555));
        var first = Assert.Single(fixture.Db.Locations);
        var taken = first.NXLayout!.Value;

        var request = NewPoint(1002, 556);
        request.NxLayout = taken;
        Assert.IsType<ConflictObjectResult>(await fixture.Controller.Create(request));
        Assert.Single(fixture.Db.Locations);

        fixture.Db.Locations.Add(new Location { Guid = Guid.NewGuid(), Name = "Невский 96", RKCode = 0, Actual = 1 });
        fixture.Db.SaveChanges();
        var free = Guid.NewGuid();
        fixture.Nx.Groups.Add((free, "Свободная"));

        var groups = Assert.IsType<List<TTController.NxGroupDto>>(
            Assert.IsType<OkObjectResult>((await fixture.Controller.GetNxGroups(null)).Result).Value);
        Assert.Equal("Невский 96", groups.Single(x => x.Id == taken).TakenBy);
        Assert.Null(groups.Single(x => x.Id == free).TakenBy);
        var own = Assert.IsType<List<TTController.NxGroupDto>>(
            Assert.IsType<OkObjectResult>((await fixture.Controller.GetNxGroups(first.Guid)).Result).Value);
        Assert.Null(own.Single(x => x.Id == taken).TakenBy);

        var update = new TTController.TTUpdateRequest { LocationTypeGuid = BakeryType, NxLayout = free };
        Assert.IsType<NoContentResult>(await fixture.Controller.Update(first.Guid, update));
        Assert.Equal(free, first.NXLayout);
        update.NxLayout = null;
        Assert.IsType<NoContentResult>(await fixture.Controller.Update(first.Guid, update));
        Assert.Null(first.NXLayout);
    }

    [Fact]
    public async Task NewPointIsNotCreatedWithoutNxGroupWhenNxIsDown()
    {
        using var fixture = Create();
        fixture.Nx.Down = true;

        var created = Assert.IsType<ObjectResult>(await fixture.Controller.Create(NewPoint(1001, 555)));
        Assert.Equal(503, created.StatusCode);
        Assert.Empty(fixture.Db.Locations);

        var groups = Assert.IsType<ObjectResult>((await fixture.Controller.GetNxGroups(null)).Result);
        Assert.Equal(503, groups.StatusCode);
    }

    [Fact]
    public async Task RejectsMissingObdOrEntityUnknownOrTakenRestaurantAndTakenObd()
    {
        using var fixture = Create();

        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.Create(NewPoint(1001, 555).WithoutObd()));
        var noEntity = NewPoint(1001, 555);
        noEntity.EntityGuid = null;
        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.Create(noEntity));
        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.Create(NewPoint(9999, 555)));
        Assert.IsType<OkObjectResult>(await fixture.Controller.Create(NewPoint(1001, 555)));
        Assert.IsType<ConflictObjectResult>(await fixture.Controller.Create(NewPoint(1001, 777)));
        Assert.IsType<ConflictObjectResult>(await fixture.Controller.Create(NewPoint(1002, 555)));
        Assert.Single(fixture.Db.Locations);
    }

    [Fact]
    public async Task SyncNamePullsRenamedRestaurantIntoLocationAndActualVersion()
    {
        using var fixture = Create();
        await fixture.Controller.Create(NewPoint(1001, 555));
        var location = Assert.Single(fixture.Db.Locations);

        var same = Assert.IsType<OkObjectResult>(await fixture.Controller.SyncName(location.Guid));
        Assert.False(Assert.IsType<TTController.TTNameSyncDto>(same.Value).Changed);

        var current = Assert.IsType<TTController.TTEditDto>(Assert.IsType<OkObjectResult>((await fixture.Controller.Get(location.Guid)).Result).Value);
        Assert.False(current.NameOutdated);

        fixture.Rk7.Restaurants.Single(x => x.Sifr == 1001).Name = "Люли Любят,  Невский 96/1";
        fixture.Rk7.SaveChanges();
        var edit = Assert.IsType<TTController.TTEditDto>(Assert.IsType<OkObjectResult>((await fixture.Controller.Get(location.Guid)).Result).Value);
        Assert.Equal("Невский 96/1", edit.Rk7Name);
        Assert.True(edit.NameOutdated);

        var renamed = Assert.IsType<OkObjectResult>(await fixture.Controller.SyncName(location.Guid));
        Assert.True(Assert.IsType<TTController.TTNameSyncDto>(renamed.Value).Changed);
        Assert.Equal("Невский 96/1", location.Name);
        Assert.Equal("Невский 96/1", Assert.Single(fixture.Db.LocationVersions).Name);
        Assert.Equal(1001, location.RKCode);
    }

    [Fact]
    public async Task NewRequisitesVersionClosesCurrentOnItsBeginDateAndKeepsRkFields()
    {
        using var fixture = Create();
        await fixture.Controller.Create(NewPoint(1001, 555));
        var location = Assert.Single(fixture.Db.Locations);

        var update = new TTController.TTUpdateRequest
        {
            AltName = "Невский, у метро",
            LocationTypeGuid = BakeryType,
            VersionStartDate = new DateTime(2026, 10, 1),
            NewRequisites = new TTController.RequisitesVersionRequest
            {
                Obd = 556,
                EntityGuid = OtherEntityGuid,
                Begin = DateTime.Today.AddDays(18).AddHours(18),
            },
        };
        Assert.IsType<NoContentResult>(await fixture.Controller.Update(location.Guid, update));

        var versions = fixture.Db.OfficeLocationRequisites.OrderBy(x => x.Begin).ToList();
        Assert.Equal(2, versions.Count);
        Assert.Equal(DateTime.Today.AddDays(18), versions[0].End);
        Assert.Equal(556, versions[1].Obd);
        Assert.Equal(OtherEntityGuid, versions[1].EntityGuid);
        Assert.Equal(DateTime.Today.AddDays(18), versions[1].Begin);
        Assert.Null(versions[1].End);
        var version = Assert.Single(fixture.Db.LocationVersions);
        Assert.Equal(556, version.OBD);
        Assert.Equal(OtherEntityGuid, version.EntityGuid);
        Assert.Equal("Невский 96", location.Name);
        Assert.Equal(1001, location.RKCode);
        Assert.Equal("Невский, у метро", location.AltName);

        // Новая версия начинается позже — сегодня точка всё ещё у прежнего юрлица.
        var entities = Assert.IsType<List<TTController.EntityListItemDto>>(
            Assert.IsType<OkObjectResult>((await fixture.Controller.GetEntities()).Result).Value);
        Assert.Equal(1, entities.Single(x => x.Id == EntityGuid).LocationsCount);
        Assert.Equal(0, entities.Single(x => x.Id == OtherEntityGuid).LocationsCount);

        update.NewRequisites = new TTController.RequisitesVersionRequest { Obd = 557, EntityGuid = EntityGuid, Begin = DateTime.Today.AddDays(18) };
        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.Update(location.Guid, update));
        update.NewRequisites = new TTController.RequisitesVersionRequest { Obd = 557, Begin = DateTime.Today.AddDays(30) };
        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.Update(location.Guid, update));
        Assert.Equal(2, fixture.Db.OfficeLocationRequisites.Count());
    }
}

internal static class TTCreateRequestExtensions
{
    public static TTController.TTCreateRequest WithoutObd(this TTController.TTCreateRequest request)
    {
        request.Obd = null;
        return request;
    }
}
