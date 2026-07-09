using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.IdentityModel.Tokens;
using Office.Server.DbContexts.RKNETDB.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Office.Server.Security
{
    public sealed class AuthTokenService
    {
        private readonly IDataProtector _refreshTokenProtector;

        public AuthTokenService(IDataProtectionProvider dataProtectionProvider)
        {
            _refreshTokenProtector = dataProtectionProvider.CreateProtector("Office.Server.Auth.RefreshToken.v1");
        }

        public string CreateAccessToken(OfficeUser user)
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(Global.SecretKey);
            var claims = new[]
            {
                new Claim(ClaimTypes.Name, user.Login),
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            };

            var tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(claims),
                Expires = DateTime.UtcNow.AddMinutes(AuthConstants.AccessTokenLifetimeMinutes),
                SigningCredentials = new SigningCredentials(
                    new SymmetricSecurityKey(key),
                    SecurityAlgorithms.HmacSha256Signature)
            };

            var token = tokenHandler.CreateToken(tokenDescriptor);
            return tokenHandler.WriteToken(token);
        }

        public RefreshTokenIssue CreateRefreshToken(OfficeUser user)
        {
            var expiresAtUtc = DateTime.UtcNow.AddDays(AuthConstants.RefreshTokenLifetimeDays);
            var payload = $"{user.Id}\n{user.Login}\n{expiresAtUtc:O}";
            return new RefreshTokenIssue
            {
                RawToken = _refreshTokenProtector.Protect(payload),
                ExpiresAtUtc = expiresAtUtc
            };
        }

        public RefreshTokenPayload? ReadRefreshToken(string rawToken)
        {
            try
            {
                var payload = _refreshTokenProtector.Unprotect(rawToken);
                var parts = payload.Split('\n');
                if (parts.Length != 3)
                {
                    return null;
                }

                if (!int.TryParse(parts[0], out var officeUserId))
                {
                    return null;
                }

                if (!DateTime.TryParse(parts[2], null, System.Globalization.DateTimeStyles.RoundtripKind, out var expiresAtUtc))
                {
                    return null;
                }

                return new RefreshTokenPayload
                {
                    OfficeUserId = officeUserId,
                    Login = parts[1],
                    ExpiresAtUtc = expiresAtUtc
                };
            }
            catch
            {
                return null;
            }
        }

        public CookieOptions BuildRefreshCookie(DateTime expiresAtUtc)
        {
            return new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Strict,
                IsEssential = true,
                Path = "/api/Authorization",
                Expires = new DateTimeOffset(expiresAtUtc)
            };
        }

        public CookieOptions BuildExpiredRefreshCookie()
        {
            return new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Strict,
                IsEssential = true,
                Path = "/api/Authorization",
                Expires = DateTimeOffset.UnixEpoch
            };
        }
    }

    public sealed class RefreshTokenIssue
    {
        public string RawToken { get; init; } = string.Empty;
        public DateTime ExpiresAtUtc { get; init; }
    }

    public sealed class RefreshTokenPayload
    {
        public int OfficeUserId { get; init; }
        public string Login { get; init; } = string.Empty;
        public DateTime ExpiresAtUtc { get; init; }
    }
}
