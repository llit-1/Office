using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using System.IdentityModel.Tokens.Jwt;
using System;
using System.DirectoryServices;
using System.Text;
using System.Security.Claims;

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
            if (password == null || login == null)
            {
                return Unauthorized(new { message = "Данные введены некорректно!" });
            }
            string? displayName = "";

            OfficeUser? user = _rKNETDBContext.OfficeUser.FirstOrDefault(c => c.Login == login);
            if (ADCheck(login,password,ref displayName))
            {
                if (user == null)
                {
                    _rKNETDBContext.OfficeUser.Add(new OfficeUser(login, displayName));
                    _rKNETDBContext.SaveChanges();
                    user = _rKNETDBContext.OfficeUser.FirstOrDefault(c => c.Login == login);
                }                                
            }            
            else
            {
                if (user == null || (user.Password != Global.Encrypt(password)))
                {
                    return Unauthorized(new { message = "Ошибка авторизации" });
                }
            }
            if (user != null)
            {
                AuthAnswer answer = new AuthAnswer();
                answer.id = user.Id;
                answer.token = GetToken(login);
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
                Expires = DateTime.UtcNow.AddHours(1),
                SigningCredentials = new(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
            };
            var tok = tokenHandler.CreateToken(tokenDescriptor);
            string? token = tokenHandler.WriteToken(tok);
            return token;
        }


        private bool ADCheck(string login, string password, ref string? displayName)
        {
            try
            {
                using (DirectoryEntry entry = new DirectoryEntry("LDAP://dc1.shzhleb.ru", login, password))
                {
                    // Создаем объект DirectorySearcher для поиска пользователя
                    using (DirectorySearcher searcher = new DirectorySearcher(entry))
                    {
                        // Устанавливаем фильтр поиска по логину пользователя
                        searcher.Filter = $"(&(objectClass=user)(sAMAccountName={login}))";

                        // Выполняем поиск
                        SearchResult result = searcher.FindOne();

                        if (result != null)
                        {
                            // Получаем объект DirectoryEntry найденного пользователя
                            DirectoryEntry userEntry = result.GetDirectoryEntry();
                            // Получаем данные пользователя
                            displayName = userEntry.Properties["displayName"].Value?.ToString();
                            return true;
                        }

                        return false;
                    }
                }
            }
            catch {
                return false;
            }
           
        }
    }
}
