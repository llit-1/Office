using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using System.DirectoryServices;
using System.DirectoryServices.AccountManagement;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class AuthorizationController : ControllerBase
    {
        private readonly RKNETDBContext _rKNETDBContext;
        public AuthorizationController(RKNETDBContext rKNETDBContext)
        {
            _rKNETDBContext = rKNETDBContext;
        }

        [HttpPost("login")]
        public IActionResult Login([FromBody] LoginModel loginModel)
        {
            if (loginModel is null)
            {
                return Unauthorized(new { message = "loginModel is null" });
            }
            string password = loginModel.Password;
            string login = loginModel.Login;
            if (password == null || login == null || !ValidateAdUser(login, password))
            {
                return Unauthorized(new { message = "Данные введены некорректно!" });
            }
            var officeUser = _rKNETDBContext.OfficeUser.FirstOrDefault(x => x.Login == login);
            if (officeUser == null)
            {
                var user = GetAdUserInfo(login);
                if (user == null)
                {
                    return Unauthorized(new { message = "Пользователь не найден в AD" });
                }
                officeUser = new();
                officeUser.Login = login;
                officeUser.Name = user.FirstName?.Trim();
                officeUser.Surname = user.LastName?.Trim();
                officeUser.Patronymic = user.MiddleName?.Trim();
                officeUser.Position = user.Position?.Trim();
                officeUser.DefaultLocations = 0;
                _rKNETDBContext.OfficeUser.Add(officeUser);
                OfficeBid officeBid = new OfficeBid();
                officeBid.OfficeUser = officeUser;
                officeBid.Status = 0;
                officeBid.DateTime = DateTime.Now;
                officeBid.Comment = $"Требуется Активация учетной записи {officeUser.Surname} {officeUser.Name} {officeUser.Patronymic}";
                _rKNETDBContext.OfficeBids.Add(officeBid);
                List<OfficeUser> gods = _rKNETDBContext.OfficeUser
                                .Where(x => x.OfficeGroup
                                .Any(g => g.OfficeRole
                                .Any(r => r.Role == "Users")))
                                .ToList();
                foreach (var god in gods)
                {
                    OfficeNotification officeNotification = new();
                    officeNotification.OfficeUserId = god.Id;
                    officeNotification.Status = 0;
                    officeNotification.DateTime = DateTime.Now;
                    officeNotification.RelatedEntity = officeBid.Id;
                    officeNotification.TypeId = 1;
                    _rKNETDBContext.OfficeNotifications.Add(officeNotification);
                }
                _rKNETDBContext.SaveChanges();
            }
            if (officeUser.Actual == 0)
            {
                AuthAnswer answer = new AuthAnswer();
                answer.id = officeUser.Id;
                answer.responseCode = 0;
                return Ok(answer);
            }
            if (officeUser.Actual == 1)
            {
                AuthAnswer answer = new AuthAnswer();
                answer.id = officeUser.Id;
                answer.token = GetToken(login);
                answer.responseCode = 1;
                return Ok(answer);
            }
            if (officeUser.Actual == 2)
            {
                AuthAnswer answer = new AuthAnswer();
                answer.id = officeUser.Id;
                answer.token = GetToken(login);
                answer.responseCode = 2;
                return Ok(answer);
            }
            return Unauthorized(new { message = "Ошибка БД" });
        }



        public class LoginModel
        {
            public string Login { get; set; } = "";
            public string Password { get; set; } = "";

        }
        private class AuthAnswer
        {
            public int id { get; set; }
            public string token { get; set; } = "";
            public int responseCode { get; set; }
        }



        private string GetToken(string name)
        {
            JwtSecurityTokenHandler tokenHandler = new();
            byte[] key = Encoding.UTF8.GetBytes(Global.SecretKey);
            SecurityTokenDescriptor tokenDescriptor = new SecurityTokenDescriptor
            {
                Subject = new ClaimsIdentity(new Claim[]
            {
                new Claim(ClaimTypes.Name, name)
            }),
                Expires = DateTime.UtcNow.AddHours(12),
                SigningCredentials = new(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            var tok = tokenHandler.CreateToken(tokenDescriptor);
            string? token = tokenHandler.WriteToken(tok);
            return token;
        }


        private bool ValidateAdUser(string login, string password)
        {
            using (var context = new PrincipalContext(ContextType.Domain))
            {
                return context.ValidateCredentials(login, password);
            }
        }


        private AdUserInfo GetAdUserInfo(string login)
        {
            using (var ctx = new PrincipalContext(ContextType.Domain))
            using (var user = UserPrincipal.FindByIdentity(ctx, login))
            {
                if (user == null)
                    return null;
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
