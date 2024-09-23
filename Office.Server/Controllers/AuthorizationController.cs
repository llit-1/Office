using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using System.IdentityModel.Tokens.Jwt;
using System.Reflection.PortableExecutable;
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
            //if (loginModel is null)
            //{
            //    return Unauthorized(new { message = "loginModel is null" });
            //}
            //string password = loginModel.Password;
            //string login = loginModel.Login;
            //if (password == null || login == null)
            //{
            //    return Unauthorized(new { message = "Данные введены некорректно!" });
            //}

            //OfficeUser user = _rKNETDBContext.OfficeUser.FirstOrDefault(c => c.Login == login);

            //// если пользователя нет в БД
            //if (user == null)
            //{
            //    using (PrincipalContext context = new PrincipalContext(login, password, "shzhleb"))
                    
            //}


            //if (user != null &&(user.Password == null || user.Password != Global.Encrypt(password)))
            //{
            //    return Unauthorized(new { message = "Ошибка авторизации" });
            //}
            //if (true)
            //{
                
            //}
            //return Ok(GetToken(phone));
            return Ok(loginModel);
        }



        public class LoginModel
        {
            public string Login { get; set; }
            public string Password { get; set; }

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

        //private bool ADIdentity(string domain, string username, string password, out string fullName, out string Error, out string jobTitle)
        //{
        //    fullName = string.Empty;
        //    jobTitle = string.Empty;
        //    Error = string.Empty;

        //    var domainAndUsername = string.Format("{0}\\{1}", domain, username);
        //    var ldapPath = "LDAP://dc1.shzhleb.ru";

        //    try
        //    {
        //        var entry = new DirectoryEntry(ldapPath, domainAndUsername, password);
        //        // Bind to the native AdsObject to force authentication.
        //        var obj = entry.NativeObject;
        //        var search = new DirectorySearcher(entry) { Filter = "(SAMAccountName=" + username + ")" };

        //        search.PropertiesToLoad.Add("displayName"); // Выводимое имя
        //        search.PropertiesToLoad.Add("title");

        //        try
        //        {
        //            var result = search.FindOne();
        //            fullName = result.GetDirectoryEntry().Properties["displayName"].Value.ToString();
        //            jobTitle = result.GetDirectoryEntry().Properties["title"].Value.ToString();
        //        }
        //        catch (Exception e)
        //        {
        //            Error = "ошибка получения свойств пользователя Active Directory: " + e.ToString();
        //        }
        //    }
        //    catch (Exception ex)
        //    {
        //        Error = "ошибка имени пользователя или пароля";
        //        return false;
        //    }

        //    return true;
        //}

    }
}
