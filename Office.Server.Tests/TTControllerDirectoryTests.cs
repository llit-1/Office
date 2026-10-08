using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Locations;
using Xunit;

namespace Office.Server.Tests;

public class TTControllerDirectoryTests
{
    private static readonly Guid FactoryType = Guid.Parse("80423E42-DC1E-4311-AD0B-08DCA4A09C33");
    private static readonly Guid WorkshopType = Guid.Parse("D3A0363D-2EC4-48E4-AD0C-08DCA4A09C33");
    private static readonly Guid OfficeType = Guid.Parse("3810B715-2164-4524-F182-08DBF1A777FF");
    private static readonly Guid EntityGuid = Guid.NewGuid();

    private sealed record Fixture(TTController Controller, RKNETDBContext Db, string Root) : IDisposable
    {
        public void Dispose()
        {
            Db.Dispose();
            if (Directory.Exists(Root))
            {
                Directory.Delete(Root, recursive: true);
            }
        }
    }

    private static Fixture Create()
    {
        var db = new RKNETDBContext(new DbContextOptionsBuilder<RKNETDBContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        db.LocationTypes.AddRange(
            new LocationType { Guid = FactoryType, Name = "Завод" },
            new LocationType { Guid = WorkshopType, Name = "Цех" },
            new LocationType { Guid = OfficeType, Name = "Офис" });
        db.Entity.Add(new Entity { Guid = EntityGuid, Name = "ООО Хлеб", Owner = 1 });
        db.JobTitles.Add(new JobTitle { Guid = Guid.NewGuid(), Name = "Пекарь" });
        db.SaveChanges();

        var root = Path.Combine(Path.GetTempPath(), $"office-entities-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?> { ["Locations:EntityDocumentsRoot"] = root })
            .Build();

        var controller = new TTController(
            db,
            new EntityFolderService(configuration, NullLogger<EntityFolderService>.Instance),
            NullLogger<TTController>.Instance);
        return new Fixture(controller, db, root);
    }

    private static TTController.LocationSaveRequest FactoryRequest(Guid type, Guid? parent = null) => new()
    {
        Name = " Цех №1 ",
        LocationTypeGuid = type,
        EntityGuid = EntityGuid,
        ParentGuid = parent,
        Address = "Заводская, 1",
        VersionStartDate = new DateTime(2024, 1, 1),
    };

    [Fact]
    public async Task CreatesFactoryLocationOnlyWithFactoryTypeAndKeepsLegacyDefaults()
    {
        using var fixture = Create();

        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.CreateLocation("factory", FactoryRequest(OfficeType)));
        Assert.IsType<OkObjectResult>(await fixture.Controller.CreateLocation("factory", FactoryRequest(WorkshopType)));

        var location = Assert.Single(fixture.Db.Locations);
        Assert.Equal("Цех №1", location.Name);
        Assert.Equal(0, location.RKCode);
        Assert.Equal(1, location.Actual);
        var version = Assert.Single(fixture.Db.LocationVersions);
        Assert.Equal(location.Guid, version.LocationGuid);
        Assert.Equal(EntityGuid, version.EntityGuid);
        Assert.Null(version.OBD);

        var edit = (await fixture.Controller.GetLocation("factory", location.Guid)).Result;
        Assert.IsType<OkObjectResult>(edit);
        Assert.IsType<NotFoundObjectResult>((await fixture.Controller.GetLocation("office", location.Guid)).Result);
    }

    [Fact]
    public async Task LocationCannotBelongToItselfOrToAnotherGroup()
    {
        using var fixture = Create();
        await fixture.Controller.CreateLocation("office", new TTController.LocationSaveRequest
        {
            Name = "Офис К37",
            LocationTypeGuid = OfficeType,
            EntityGuid = EntityGuid,
        });
        var office = fixture.Db.Locations.Single();

        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.CreateLocation("factory", FactoryRequest(WorkshopType, office.Guid)));

        var update = new TTController.LocationSaveRequest
        {
            Name = "Офис К37",
            LocationTypeGuid = OfficeType,
            EntityGuid = EntityGuid,
            ParentGuid = office.Guid,
        };
        Assert.IsType<BadRequestObjectResult>(await fixture.Controller.UpdateLocation("office", office.Guid, update));
    }

    [Fact]
    public async Task EntityFolderIsCreatedRenamedAndDeletedWithFilesOnlyAfterConfirmation()
    {
        using var fixture = Create();
        var created = await fixture.Controller.CreateEntity(new TTController.EntitySaveRequest { Name = "ООО Ромашка", Owner = 1, Folder = true });
        Assert.IsType<OkObjectResult>(created);
        var entity = fixture.Db.Entity.Single(x => x.Name == "ООО Ромашка");
        Assert.True(Directory.Exists(Path.Combine(fixture.Root, "ООО Ромашка")));
        await File.WriteAllTextAsync(Path.Combine(fixture.Root, "ООО Ромашка", "договор.pdf"), "pdf");

        Assert.IsType<NoContentResult>(await fixture.Controller.UpdateEntity(entity.Guid,
            new TTController.EntitySaveRequest { Name = "ООО Василёк", Owner = 0, Folder = true }));
        Assert.False(Directory.Exists(Path.Combine(fixture.Root, "ООО Ромашка")));
        Assert.True(File.Exists(Path.Combine(fixture.Root, "ООО Василёк", "договор.pdf")));

        var withoutConfirmation = await fixture.Controller.UpdateEntity(entity.Guid,
            new TTController.EntitySaveRequest { Name = "ООО Василёк", Owner = 0, Folder = false });
        Assert.IsType<ConflictObjectResult>(withoutConfirmation);
        Assert.True(Directory.Exists(Path.Combine(fixture.Root, "ООО Василёк")));

        Assert.IsType<NoContentResult>(await fixture.Controller.UpdateEntity(entity.Guid,
            new TTController.EntitySaveRequest { Name = "ООО Василёк", Owner = 0, Folder = false, ConfirmFolderDeletion = true }));
        Assert.False(Directory.Exists(Path.Combine(fixture.Root, "ООО Василёк")));
        Assert.Equal(0, fixture.Db.Entity.Single(x => x.Guid == entity.Guid).Owner);
    }

    [Fact]
    public async Task DirectoryNamesMustBeUniqueIgnoringCase()
    {
        using var fixture = Create();

        Assert.IsType<ConflictObjectResult>(await fixture.Controller.CreateEntity(new TTController.EntitySaveRequest { Name = "ооо хлеб", Owner = 1 }));
        Assert.IsType<ConflictObjectResult>(await fixture.Controller.CreateJobTitle(new TTController.NamedItemSaveRequest { Name = " ПЕКАРЬ " }));
        Assert.IsType<ConflictObjectResult>(await fixture.Controller.CreateLocationType(new TTController.NamedItemSaveRequest { Name = "завод" }));
        Assert.IsType<OkObjectResult>(await fixture.Controller.CreateLocationType(new TTController.NamedItemSaveRequest { Name = "Склад" }));

        var factory = fixture.Db.LocationTypes.Single(x => x.Guid == FactoryType);
        Assert.IsType<NoContentResult>(await fixture.Controller.UpdateLocationType(FactoryType, new TTController.NamedItemSaveRequest { Name = "Завод" }));
        Assert.IsType<ConflictObjectResult>(await fixture.Controller.UpdateLocationType(FactoryType, new TTController.NamedItemSaveRequest { Name = "Цех" }));
        Assert.Equal("Завод", factory.Name);
    }
}
