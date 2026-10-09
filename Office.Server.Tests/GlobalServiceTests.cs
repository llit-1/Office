using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Services;
using Xunit;

namespace Office.Server.Tests;

public class GlobalServiceTests
{
    private const int BoundUserId = 1;
    private const int AllLocationsUserId = 2;

    private static RKNETDBContext CreateDb()
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var nevsky = new Location { Guid = Guid.NewGuid(), Name = "Невский 87", Actual = 1 };
        var toreza = new Location { Guid = Guid.NewGuid(), Name = "Тореза 9", Actual = 1 };
        var closed = new Location { Guid = Guid.NewGuid(), Name = "Лермонтовский 8", Actual = 0 };
        db.Locations.AddRange(nevsky, toreza, closed);

        var boundUser = new OfficeUser("bound", "Анна") { Id = BoundUserId, Actual = 1 };
        boundUser.Locations.Add(toreza);
        boundUser.Locations.Add(closed);
        db.OfficeUser.AddRange(
            boundUser,
            new OfficeUser("all", "Ольга") { Id = AllLocationsUserId, Actual = 1, DefaultLocations = 1 });
        db.SaveChanges();
        db.ChangeTracker.Clear();
        return db;
    }

    [Fact]
    public async Task GetUserLocationsAsync_ReturnsActualLocationsBoundToUser()
    {
        using var db = CreateDb();

        var locations = await new GlobalService(db).GetUserLocationsAsync(BoundUserId);

        Assert.Equal(["Тореза 9"], locations.Select(x => x.Name));
    }

    [Fact]
    public async Task GetUserLocationsAsync_ReturnsAllActualLocationsForUserWithDefaultLocations()
    {
        using var db = CreateDb();

        var locations = await new GlobalService(db).GetUserLocationsAsync(AllLocationsUserId);

        Assert.Equal(["Невский 87", "Тореза 9"], locations.Select(x => x.Name));
    }

    [Fact]
    public async Task GetUserLocationsAsync_ReturnsEmptyListForUnknownUser()
    {
        using var db = CreateDb();

        Assert.Empty(await new GlobalService(db).GetUserLocationsAsync(99));
    }
}
