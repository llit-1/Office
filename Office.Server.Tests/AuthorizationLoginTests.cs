using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Xunit;

namespace Office.Server.Tests;

public class AuthorizationLoginTests
{
    private static RKNETDBContext CreateDb() => new(new DbContextOptionsBuilder<RKNETDBContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private sealed class Controller(RKNETDBContext db) : AuthorizationController(
        db, null!, null!, NullLogger<AuthorizationController>.Instance)
    {
        public bool Valid { get; set; } = true;
        public AdUserInfo? DirectoryUser { get; set; } = new()
        {
            Login = "adsmolkin", UserPrincipalName = "Adsmolkin@shzhleb.ru", FirstName = "Александр"
        };
        protected override bool ValidateAdUser(string login, string password) => Valid;
        protected override AdUserInfo? GetAdUserInfo(string login) => DirectoryUser;
        public Task<IActionResult> SignIn(string login) => Login(new LoginModel { Login = login, Password = "test-password" });
    }

    [Theory]
    [InlineData("adsmolkin")]
    [InlineData("Adsmolkin@shzhleb.ru")]
    [InlineData("  ADSMOLKIN  ")]
    public async Task LoginUsesExistingCanonicalAccount(string input)
    {
        using var db = CreateDb();
        db.OfficeUser.Add(new OfficeUser { Id = 42, Login = "AdSmOlKiN", Actual = 2 });
        await db.SaveChangesAsync();
        var result = await new Controller(db).SignIn(input);
        Assert.IsType<OkObjectResult>(result);
        var user = Assert.Single(await db.OfficeUser.ToListAsync());
        Assert.Equal(42, user.Id);
        Assert.Equal("adsmolkin", user.Login);
        Assert.Equal(2, user.Actual); // An alias must not bypass a blocked account.
        Assert.Empty(db.OfficeBids);
    }

    [Fact]
    public async Task UpnOnlyAccountRetainsItsIdAndPermissions()
    {
        using var db = CreateDb();
        var group = new OfficeGroup { Name = "Existing access" };
        db.OfficeUser.Add(new OfficeUser { Id = 42, Login = "ADSMOLKIN@SHZHLEB.RU", OfficeGroup = [group] });
        await db.SaveChangesAsync();
        Assert.IsType<OkObjectResult>(await new Controller(db).SignIn("adsmolkin"));
        var user = Assert.Single(db.OfficeUser);
        Assert.Equal(42, user.Id);
        Assert.Equal("adsmolkin", user.Login);
        Assert.Single(user.OfficeGroup);
        Assert.Empty(db.OfficeBids);
    }

    [Fact]
    public async Task ExistingDuplicatesUseCanonicalAccountWithoutMergingRights()
    {
        using var db = CreateDb();
        db.OfficeUser.AddRange(
            new OfficeUser { Id = 1, Login = "adsmolkin", Actual = 2 },
            new OfficeUser { Id = 2, Login = "Adsmolkin@shzhleb.ru", Actual = 1 });
        await db.SaveChangesAsync();
        var result = Assert.IsType<OkObjectResult>(await new Controller(db).SignIn("Adsmolkin@shzhleb.ru"));
        Assert.Equal(1, result.Value!.GetType().GetProperty("id")!.GetValue(result.Value));
        Assert.Equal(2, db.OfficeUser.Count());
        Assert.Empty(db.OfficeBids);
    }

    [Fact]
    public async Task FirstLoginCreatesOnlyOneAccountAcrossBothForms()
    {
        using var db = CreateDb();
        var controller = new Controller(db);
        Assert.IsType<OkObjectResult>(await controller.SignIn("Adsmolkin@shzhleb.ru"));
        Assert.IsType<OkObjectResult>(await controller.SignIn("adsmolkin"));
        Assert.Equal("adsmolkin", Assert.Single(db.OfficeUser).Login);
        Assert.Single(db.OfficeBids);
    }

    [Fact]
    public async Task InvalidCredentialsOrMissingDirectoryIdentityCannotCreateAccount()
    {
        using var db = CreateDb();
        var controller = new Controller(db) { Valid = false };
        Assert.IsType<UnauthorizedObjectResult>(await controller.SignIn("adsmolkin"));
        controller.Valid = true;
        controller.DirectoryUser = null;
        Assert.IsType<UnauthorizedObjectResult>(await controller.SignIn("adsmolkin"));
        Assert.Empty(db.OfficeUser);
    }

    [Fact]
    public async Task AmbiguousCanonicalAccountsAreRejected()
    {
        using var db = CreateDb();
        db.OfficeUser.AddRange(new OfficeUser { Login = "adsmolkin" }, new OfficeUser { Login = "ADSMOLKIN" });
        await db.SaveChangesAsync();
        Assert.IsType<ConflictObjectResult>(await new Controller(db).SignIn("Adsmolkin@shzhleb.ru"));
        Assert.Empty(db.OfficeBids);
    }
}
