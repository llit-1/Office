using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.IdentityModel.Tokens;
using Office.Server.DbContexts.RKNETDB.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Cryptography;
using System.Security.Claims;
using System.Text;

namespace Office.Server.Security
{
    public sealed class AuthTokenService
    {
        private readonly IDataProtector _refreshTokenProtector;
        private readonly ILogger<AuthTokenService> _logger;

        public AuthTokenService(
            IDataProtectionProvider dataProtectionProvider,
            ILogger<AuthTokenService> logger)
        {
            _refreshTokenProtector = dataProtectionProvider.CreateProtector("Office.Server.Auth.RefreshToken.v1");
            _logger = logger;
        }

        public string CreateAccessToken(OfficeUser user)
        {
            var tokenHandler = new JwtSecurityTokenHandler();
            var key = Encoding.UTF8.GetBytes(Global.SecretKey);
            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.Name, user.Login),
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            };

            claims.AddRange(user.OfficeGroup
                .SelectMany(group => group.OfficeRole)
                .Select(role => role.Role?.Trim())
                .Where(role => !string.IsNullOrWhiteSpace(role))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .Select(role => new Claim(ClaimTypes.Role, role!)));

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

        public bool TryReadRefreshToken(
            string rawToken,
            out RefreshTokenPayload? refreshToken,
            out string failureReason)
        {
            refreshToken = null;
            failureReason = string.Empty;

            try
            {
                var payload = _refreshTokenProtector.Unprotect(rawToken);
                var parts = payload.Split('\n');
                if (parts.Length != 3)
                {
                    failureReason = "malformed_payload";
                    return false;
                }

                if (!int.TryParse(parts[0], out var officeUserId))
                {
                    failureReason = "invalid_user_id";
                    return false;
                }

                if (!DateTime.TryParse(parts[2], null, System.Globalization.DateTimeStyles.RoundtripKind, out var expiresAtUtc))
                {
                    failureReason = "invalid_expiration";
                    return false;
                }

                refreshToken = new RefreshTokenPayload
                {
                    OfficeUserId = officeUserId,
                    Login = parts[1],
                    ExpiresAtUtc = expiresAtUtc
                };
                return true;
            }
            catch (CryptographicException ex)
            {
                failureReason = "unprotect_failed";
                _logger.LogWarning(ex, "Refresh token could not be decrypted with the current Data Protection key ring.");
                return false;
            }
            catch (Exception ex)
            {
                failureReason = "unexpected_read_error";
                _logger.LogError(ex, "Unexpected error while reading a refresh token.");
                return false;
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
