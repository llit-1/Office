using System.IdentityModel.Tokens.Jwt;
using System.Reflection;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Office.Server.Controllers;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Security;
using Xunit;

namespace Office.Server.Tests;

public class AuthorizationImpersonationTests
{
    private const int AdminId = 1;
    private const int TargetId = 2;
    private const int OtherAdminId = 3;

    private readonly RKNETDBContext _db = new(new DbContextOptionsBuilder<RKNETDBContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    // One key ring for the whole test: cookies issued by one request must be readable by the next.
    private readonly AuthTokenService _tokens = new(
        new EphemeralDataProtectionProvider(), NullLogger<AuthTokenService>.Instance);

    // Browser cookie jar shared between requests.
    private readonly Dictionary<string, string> _cookies = new();

    public AuthorizationImpersonationTests()
    {
        var adminGroup = new OfficeGroup { Name = "Админ", OfficeRole = [new OfficeRole { Name = "Админ", Role = "Admin" }] };
        var ttGroup = new OfficeGroup { Name = "ТТ", OfficeRole = [new OfficeRole { Name = "Калькулятор", Role = "Calculator" }] };
        var shoutingAdminGroup = new OfficeGroup { Name = "Админ 2", OfficeRole = [new OfficeRole { Name = "Админ 2", Role = " ADMIN " }] };
        _db.OfficeUser.AddRange(
            new OfficeUser { Id = AdminId, Login = "admin", Surname = "Иванов", Name = "Иван", Actual = 1, OfficeGroup = [adminGroup] },
            new OfficeUser { Id = TargetId, Login = "ll-test", Surname = "Розница", Name = "Тест", Actual = 0, OfficeGroup = [ttGroup] },
            new OfficeUser { Id = OtherAdminId, Login = "admin2", Actual = 1, OfficeGroup = [shoutingAdminGroup] });
        _db.SaveChanges();
    }

    private AuthorizationController Controller(int? callerId = null)
    {
        var context = new DefaultHttpContext();
        if (_cookies.Count > 0)
        {
            context.Request.Headers.Cookie = string.Join("; ", _cookies.Select(x => $"{x.Key}={x.Value}"));
        }

        if (callerId is int id)
        {
            context.User = new ClaimsPrincipal(new ClaimsIdentity(
                [new Claim(ClaimTypes.NameIdentifier, id.ToString())], "test"));
        }

        return new AuthorizationController(_db, _tokens, new ClientInfoParser(), NullLogger<AuthorizationController>.Instance)
        {
            ControllerContext = new ControllerContext { HttpContext = context }
        };
    }

    private async Task<IActionResult> Call(Func<AuthorizationController, Task<IActionResult>> action, int? callerId = null)
    {
        var controller = Controller(callerId);
        var result = await action(controller);
        foreach (var header in controller.Response.Headers.SetCookie)
        {
            var pair = header!.Split(';')[0].Split('=', 2);
            if (header.Contains("expires=Thu, 01 Jan 1970", StringComparison.OrdinalIgnoreCase) || pair[1].Length == 0)
            {
                _cookies.Remove(pair[0]);
            }
            else
            {
                _cookies[pair[0]] = pair[1];
            }
        }

        return result;
    }

    private void SignInAsAdmin() =>
        _cookies[AuthConstants.RefreshCookieName] = Uri.EscapeDataString(_tokens.CreateRefreshToken(_db.OfficeUser.Find(AdminId)!).RawToken);

    private static T Field<T>(IActionResult result, string name)
    {
        var value = Assert.IsType<OkObjectResult>(result).Value!;
        return (T)value.GetType().GetProperty(name)!.GetValue(value)!;
    }

    private static string? Answer(IActionResult result, string name)
    {
        var value = Assert.IsType<OkObjectResult>(result).Value!;
        return value.GetType().GetProperty(name)!.GetValue(value)?.ToString();
    }

    private static int TokenUserId(IActionResult result) =>
        int.Parse(new JwtSecurityTokenHandler().ReadJwtToken(Field<string>(result, "token"))
            .Claims.First(x => x.Type == "nameid").Value);

    [Fact]
    public void OnlyAdminRoleReachesImpersonate()
    {
        Assert.Empty(typeof(AuthorizationController).GetCustomAttributes<AllowAnonymousAttribute>());
        var action = typeof(AuthorizationController).GetMethod(nameof(AuthorizationController.Impersonate))!;
        Assert.Empty(action.GetCustomAttributes<AllowAnonymousAttribute>());
        Assert.Equal("Admin", Assert.Single(action.GetCustomAttributes<AuthorizeAttribute>()).Roles);
    }

    [Fact]
    public async Task CallerWithoutAdminRoleInDatabaseIsForbidden()
    {
        var result = await Call(c => c.Impersonate(AdminId), callerId: TargetId);
        Assert.Equal(StatusCodes.Status403Forbidden, Assert.IsType<ObjectResult>(result).StatusCode);
        Assert.False(_cookies.ContainsKey(AuthConstants.ImpersonationCookieName));
    }

    [Fact]
    public async Task AdminTargetIsRejectedWhateverTheRoleCasing()
    {
        SignInAsAdmin();
        Assert.IsType<ConflictObjectResult>(await Call(c => c.Impersonate(OtherAdminId), callerId: AdminId));
        Assert.False(_cookies.ContainsKey(AuthConstants.ImpersonationCookieName));
    }

    [Fact]
    public async Task InactiveUserCanBeImpersonatedAndLoginIsLoggedForHim()
    {
        SignInAsAdmin();
        var result = await Call(c => c.Impersonate(TargetId), callerId: AdminId);

        Assert.Equal(TargetId, TokenUserId(result));
        Assert.Equal("Иванов Иван", Answer(result, "impersonatedBy"));
        Assert.True(_cookies.ContainsKey(AuthConstants.ImpersonationCookieName));
        var log = Assert.Single(_db.OfficeAuthLogs);
        Assert.Equal(TargetId, log.OfficeUserId);
    }

    [Fact]
    public async Task RefreshKeepsImpersonationAndRefreshCookieStaysAdmins()
    {
        SignInAsAdmin();
        await Call(c => c.Impersonate(TargetId), callerId: AdminId);

        var refreshed = await Call(c => c.Refresh());
        Assert.Equal(TargetId, TokenUserId(refreshed));
        Assert.Equal("Иванов Иван", Answer(refreshed, "impersonatedBy"));

        Assert.True(_tokens.TryReadRefreshToken(
            Uri.UnescapeDataString(_cookies[AuthConstants.RefreshCookieName]), out var refresh, out _));
        Assert.Equal(AdminId, refresh!.OfficeUserId);
    }

    [Fact]
    public async Task RefreshReturnsAdminWhenAdminLostTheRole()
    {
        SignInAsAdmin();
        await Call(c => c.Impersonate(TargetId), callerId: AdminId);
        var admin = _db.OfficeUser.Include(x => x.OfficeGroup).Single(x => x.Id == AdminId);
        admin.OfficeGroup.Clear();
        _db.SaveChanges();

        var refreshed = await Call(c => c.Refresh());
        Assert.Equal(AdminId, TokenUserId(refreshed));
        Assert.Null(Answer(refreshed, "impersonatedBy"));
        Assert.False(_cookies.ContainsKey(AuthConstants.ImpersonationCookieName));
    }

    [Fact]
    public async Task RefreshReturnsAdminWhenTargetBecameAdmin()
    {
        SignInAsAdmin();
        await Call(c => c.Impersonate(TargetId), callerId: AdminId);
        var target = _db.OfficeUser.Include(x => x.OfficeGroup).Single(x => x.Id == TargetId);
        target.OfficeGroup.Add(_db.OfficeGroup.Single(x => x.Name == "Админ"));
        _db.SaveChanges();

        Assert.Equal(AdminId, TokenUserId(await Call(c => c.Refresh())));
        Assert.False(_cookies.ContainsKey(AuthConstants.ImpersonationCookieName));
    }

    [Fact]
    public async Task RefreshIgnoresAnotherAdminsImpersonationCookie()
    {
        SignInAsAdmin();
        var foreign = _tokens.CreateImpersonationToken(_db.OfficeUser.Find(OtherAdminId)!, _db.OfficeUser.Find(TargetId)!);
        _cookies[AuthConstants.ImpersonationCookieName] = Uri.EscapeDataString(foreign.RawToken);

        Assert.Equal(AdminId, TokenUserId(await Call(c => c.Refresh())));
        Assert.False(_cookies.ContainsKey(AuthConstants.ImpersonationCookieName));
    }

    [Fact]
    public async Task StopReturnsAdminSession()
    {
        SignInAsAdmin();
        await Call(c => c.Impersonate(TargetId), callerId: AdminId);

        var stopped = await Call(c => c.StopImpersonation());
        Assert.Equal(AdminId, TokenUserId(stopped));
        Assert.Null(Answer(stopped, "impersonatedBy"));
        Assert.False(_cookies.ContainsKey(AuthConstants.ImpersonationCookieName));
        Assert.Equal(AdminId, TokenUserId(await Call(c => c.Refresh())));
    }

    [Fact]
    public async Task StopWithoutRefreshCookieIsUnauthorizedAndDropsImpersonation()
    {
        SignInAsAdmin();
        await Call(c => c.Impersonate(TargetId), callerId: AdminId);
        _cookies.Remove(AuthConstants.RefreshCookieName);

        Assert.IsType<UnauthorizedObjectResult>(await Call(c => c.StopImpersonation()));
        Assert.False(_cookies.ContainsKey(AuthConstants.ImpersonationCookieName));
    }

    private sealed class FormLoginController(RKNETDBContext db, AuthTokenService tokens)
        : AuthorizationController(db, tokens, new ClientInfoParser(), NullLogger<AuthorizationController>.Instance)
    {
        private readonly LoginAttempts _attempts = new();
        protected override LoginAttempts Attempts => _attempts;
        protected override bool ValidateAdUser(string login, string password) => true;
        protected override AdUserInfo? GetAdUserInfo(string login) => new() { Login = "admin", LastName = "Иванов", FirstName = "Иван" };
        public Task<IActionResult> SignIn() => Login(new LoginModel { Login = "admin", Password = "test-password" });
    }

    [Fact]
    public async Task FormLoginDropsLeftoverImpersonation()
    {
        SignInAsAdmin();
        await Call(c => c.Impersonate(TargetId), callerId: AdminId);

        var form = new FormLoginController(_db, _tokens);
        form.ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() };
        form.HttpContext.Request.Headers.Cookie = string.Join("; ", _cookies.Select(x => $"{x.Key}={x.Value}"));
        Assert.Equal(AdminId, TokenUserId(await form.SignIn()));
        Assert.Contains(form.Response.Headers.SetCookie, header =>
            header!.StartsWith(AuthConstants.ImpersonationCookieName + "=;", StringComparison.Ordinal) &&
            header.Contains("path=/api/Authorization", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task LogoutDropsImpersonation()
    {
        SignInAsAdmin();
        await Call(c => c.Impersonate(TargetId), callerId: AdminId);

        await Call(c => Task.FromResult(c.Logout()));
        Assert.Empty(_cookies);
    }
}
