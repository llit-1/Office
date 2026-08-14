using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.Security;
using System.DirectoryServices;
using System.DirectoryServices.AccountManagement;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [AllowAnonymous]
    public class AuthorizationController : ControllerBase
    {
        private static readonly TimeZoneInfo MoscowTimeZone = ResolveMoscowTimeZone();
        private readonly RKNETDBContext _rKNETDBContext;
        private readonly AuthTokenService _authTokenService;
        private readonly ClientInfoParser _clientInfoParser;
        private readonly ILogger<AuthorizationController> _logger;

        public AuthorizationController(
            RKNETDBContext rKNETDBContext,
            AuthTokenService authTokenService,
            ClientInfoParser clientInfoParser,
            ILogger<AuthorizationController> logger)
        {
            _rKNETDBContext = rKNETDBContext;
            _authTokenService = authTokenService;
            _clientInfoParser = clientInfoParser;
            _logger = logger;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginModel loginModel)
        {
            if (loginModel is null)
            {
                return Unauthorized(new { message = "loginModel is null" });
            }

            var password = loginModel.Password;
            var login = loginModel.Login;
            if (password == null || login == null || !ValidateAdUser(login, password))
            {
                return Unauthorized(new { message = "Данные введены некорректно!" });
            }

            var adUser = GetAdUserInfo(login);
            var officeUser = await OfficeUsersWithRoles().FirstOrDefaultAsync(x => x.Login == login);
            if (officeUser == null)
            {
                if (adUser == null)
                {
                    return Unauthorized(new { message = "Пользователь не найден в AD" });
                }

                officeUser = new OfficeUser
                {
                    Login = login,
                    Name = adUser.FirstName?.Trim(),
                    Surname = adUser.LastName?.Trim(),
                    Patronymic = adUser.MiddleName?.Trim(),
                    Position = adUser.Position?.Trim(),
                    DefaultLocations = 0
                };
                _rKNETDBContext.OfficeUser.Add(officeUser);

                var officeBid = new OfficeBid
                {
                    OfficeUser = officeUser,
                    Status = 0,
                    DateTime = DateTime.Now,
                    Comment = $"Требуется Активация учетной записи {officeUser.Surname} {officeUser.Name} {officeUser.Patronymic}"
                };
                _rKNETDBContext.OfficeBids.Add(officeBid);
                await _rKNETDBContext.SaveChangesAsync();

                var gods = await _rKNETDBContext.OfficeUser
                    .Where(x => x.OfficeGroup.Any(g => g.OfficeRole.Any(r => r.Role == "Users")))
                    .ToListAsync();

                foreach (var god in gods)
                {
                    _rKNETDBContext.OfficeNotifications.Add(new OfficeNotification
                    {
                        OfficeUserId = god.Id,
                        Status = 0,
                        DateTime = DateTime.Now,
                        RelatedEntity = officeBid.Id,
                        TypeId = 1
                    });
                }

                await _rKNETDBContext.SaveChangesAsync();
            }
            else if (adUser != null)
            {
                officeUser.Name = adUser.FirstName?.Trim();
                officeUser.Surname = adUser.LastName?.Trim();
                officeUser.Patronymic = adUser.MiddleName?.Trim();
                officeUser.Position = adUser.Position?.Trim();
                await _rKNETDBContext.SaveChangesAsync();
            }

            if (officeUser.Actual == 0)
            {
                return Ok(new AuthAnswer
                {
                    id = officeUser.Id,
                    responseCode = 0,
                    fullName = GetDisplayName(officeUser, adUser),
                    position = adUser?.Position?.Trim() ?? officeUser.Position?.Trim()
                });
            }

            if (officeUser.Actual == 1)
            {
                return Ok(await IssueTokensAsync(officeUser, adUser));
            }

            if (officeUser.Actual == 2)
            {
                return Ok(new AuthAnswer
                {
                    id = officeUser.Id,
                    responseCode = 2,
                    fullName = GetDisplayName(officeUser, adUser),
                    position = adUser?.Position?.Trim() ?? officeUser.Position?.Trim()
                });
            }

            return Unauthorized(new { message = "Ошибка БД" });
        }

        [HttpPost("refresh")]
        public async Task<IActionResult> Refresh()
        {
            var rawRefreshToken = Request.Cookies[AuthConstants.RefreshCookieName];
            if (string.IsNullOrWhiteSpace(rawRefreshToken))
            {
                LogRefreshRejection("missing_cookie");
                ClearRefreshCookie();
                return Unauthorized(new { message = "Refresh token is missing" });
            }

            if (!_authTokenService.TryReadRefreshToken(rawRefreshToken, out var refreshPayload, out var failureReason) ||
                refreshPayload is null)
            {
                LogRefreshRejection(failureReason);
                ClearRefreshCookie();
                return Unauthorized(new { message = "Refresh token is invalid" });
            }

            if (refreshPayload.ExpiresAtUtc <= DateTime.UtcNow)
            {
                LogRefreshRejection("expired", refreshPayload.OfficeUserId);
                ClearRefreshCookie();
                return Unauthorized(new { message = "Refresh token expired" });
            }

            OfficeUser? officeUser;
            try
            {
                officeUser = await OfficeUsersWithRoles().FirstOrDefaultAsync(x =>
                    x.Id == refreshPayload.OfficeUserId &&
                    x.Login == refreshPayload.Login);
            }
            catch (Exception ex)
            {
                _logger.LogError(
                    ex,
                    "Refresh token validation could not load user {OfficeUserId}. The cookie was preserved for retry.",
                    refreshPayload.OfficeUserId);
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    message = "Session validation is temporarily unavailable"
                });
            }

            if (officeUser is null || officeUser.Actual != 1)
            {
                LogRefreshRejection("user_inactive_or_missing", refreshPayload.OfficeUserId);
                ClearRefreshCookie();
                return Unauthorized(new { message = "User is not active" });
            }

            _logger.LogDebug("Session refreshed for user {OfficeUserId}.", officeUser.Id);
            return Ok(IssueTokens(officeUser, null));
        }

        [HttpPost("logout")]
        public IActionResult Logout()
        {
            ClearRefreshCookie();
            return NoContent();
        }

        public class LoginModel
        {
            public string Login { get; set; } = string.Empty;
            public string Password { get; set; } = string.Empty;
        }

        private class AuthAnswer
        {
            public int id { get; set; }
            public string token { get; set; } = string.Empty;
            public int responseCode { get; set; }
            public string? fullName { get; set; }
            public string? position { get; set; }
        }

        private bool ValidateAdUser(string login, string password)
        {
            using var context = new PrincipalContext(ContextType.Domain);
            return context.ValidateCredentials(login, password);
        }

        private AdUserInfo? GetAdUserInfo(string login)
        {
            using var ctx = new PrincipalContext(ContextType.Domain);
            using var user = UserPrincipal.FindByIdentity(ctx, login);
            if (user == null)
            {
                return null;
            }

            var de = (DirectoryEntry)user.GetUnderlyingObject();
            return new AdUserInfo
            {
                Login = user.SamAccountName,
                FirstName = de.Properties["givenName"]?.Value?.ToString(),
                LastName = de.Properties["sn"]?.Value?.ToString(),
                MiddleName = de.Properties["middleName"]?.Value?.ToString(),
                FullName = de.Properties["displayName"]?.Value?.ToString(),
                Position = de.Properties["title"]?.Value?.ToString()
            };
        }

        private async Task<AuthAnswer> IssueTokensAsync(OfficeUser officeUser, AdUserInfo? adUser)
        {
            await WriteSuccessfulLoginLogAsync(officeUser);
            await _rKNETDBContext.SaveChangesAsync();
            return IssueTokens(officeUser, adUser);
        }

        private AuthAnswer IssueTokens(OfficeUser officeUser, AdUserInfo? adUser)
        {
            var refreshToken = _authTokenService.CreateRefreshToken(officeUser);
            Response.Cookies.Append(
                AuthConstants.RefreshCookieName,
                refreshToken.RawToken,
                _authTokenService.BuildRefreshCookie(refreshToken.ExpiresAtUtc));

            return new AuthAnswer
            {
                id = officeUser.Id,
                token = _authTokenService.CreateAccessToken(officeUser),
                responseCode = 1,
                fullName = GetDisplayName(officeUser, adUser),
                position = adUser?.Position?.Trim() ?? officeUser.Position?.Trim()
            };
        }

        private async Task WriteSuccessfulLoginLogAsync(OfficeUser officeUser)
        {
            var clientInfo = _clientInfoParser.Parse(GetUserAgent());
            _rKNETDBContext.OfficeAuthLogs.Add(new OfficeAuthLog
            {
                OfficeUserId = officeUser.Id,
                Login = officeUser.Login,
                LoggedDate = GetMoscowNow(),
                IpAddress = Truncate(GetRemoteIp(), 64),
                UserAgent = clientInfo.UserAgent,
                DeviceType = Truncate(clientInfo.DeviceType, 20),
                DeviceOs = Truncate(clientInfo.DeviceOs, 50),
                Browser = Truncate(clientInfo.Browser, 50),
                BrowserVersion = Truncate(clientInfo.BrowserVersion, 50),
                IsMobile = clientInfo.IsMobile,
                RequestScheme = Truncate(Request.Scheme, 10)
            });
            await Task.CompletedTask;
        }

        private void ClearRefreshCookie()
        {
            Response.Cookies.Append(
                AuthConstants.RefreshCookieName,
                string.Empty,
                _authTokenService.BuildExpiredRefreshCookie());
        }

        private IQueryable<OfficeUser> OfficeUsersWithRoles()
        {
            return _rKNETDBContext.OfficeUser
                .Include(user => user.OfficeGroup)
                .ThenInclude(group => group.OfficeRole);
        }

        private void LogRefreshRejection(string reason, int? officeUserId = null)
        {
            _logger.LogWarning(
                "Session refresh rejected. Reason={Reason}; OfficeUserId={OfficeUserId}; Scheme={Scheme}; Host={Host}; RemoteIp={RemoteIp}",
                reason,
                officeUserId,
                Request.Scheme,
                Request.Host.Value,
                GetRemoteIp());
        }

        private string? GetUserAgent()
        {
            var userAgent = Request.Headers.UserAgent.ToString();
            if (string.IsNullOrWhiteSpace(userAgent))
            {
                return null;
            }

            return userAgent.Length <= 512 ? userAgent : userAgent[..512];
        }

        private string? GetRemoteIp()
        {
            return HttpContext.Connection.RemoteIpAddress?.ToString();
        }

        private static string? Truncate(string? value, int maxLength)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }

            var trimmed = value.Trim();
            return trimmed.Length <= maxLength ? trimmed : trimmed[..maxLength];
        }

        private static string? GetDisplayName(OfficeUser officeUser, AdUserInfo? adUser)
        {
            if (!string.IsNullOrWhiteSpace(adUser?.FullName))
            {
                return adUser.FullName.Trim();
            }

            var parts = new[]
            {
                officeUser.Surname?.Trim(),
                officeUser.Name?.Trim(),
                officeUser.Patronymic?.Trim()
            }
            .Where(x => !string.IsNullOrWhiteSpace(x));

            var fullName = string.Join(" ", parts);
            return string.IsNullOrWhiteSpace(fullName) ? null : fullName;
        }

        private static DateTime GetMoscowNow()
        {
            return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, MoscowTimeZone);
        }

        private static TimeZoneInfo ResolveMoscowTimeZone()
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Russian Standard Time");
            }
            catch (TimeZoneNotFoundException)
            {
                return TimeZoneInfo.FindSystemTimeZoneById("Europe/Moscow");
            }
        }
    }

    public class AdUserInfo
    {
        public string? Login { get; set; }
        public string? FirstName { get; set; }
        public string? LastName { get; set; }
        public string? MiddleName { get; set; }
        public string? FullName { get; set; }
        public string? Position { get; set; }
    }
}
