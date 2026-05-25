using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class DataUpdateController : ControllerBase
    {
        private readonly RKNETDBContext _rKNETDBContext;
        public DataUpdateController(RKNETDBContext rKNETDBContext)
        {
            _rKNETDBContext = rKNETDBContext;
        }


        [HttpGet("getdata")]
        public async Task<ActionResult> GetData(int userId)
        {
            Data data = new();
            OfficeUser user = _rKNETDBContext.OfficeUser.Include(x=> x.OfficeNotifications)
                                                        .Include(x=> x.OfficeGroup)
                                                        .ThenInclude(y => y.OfficeRole)
                                                        .FirstOrDefault(x => x.Id == userId);
            if (user == null)
            {
                return NotFound(new { message = "Пользователь не найден" });
            }          
            data.NewNotifications = user.OfficeNotifications.Where(x => x.Status == 0).ToList();
            data.ActiveNotifications = user.OfficeNotifications.Where(x => x.Status == 1).ToList();
            foreach (var item in user.OfficeGroup)
            {
                data.Roles.AddRange(item.OfficeRole.Select(x => x.Name));
            }
            data.Roles = data.Roles.Distinct().ToList();
            return Ok(data);
        }
    }

    public class Data()
    {
        public List<OfficeNotification> NewNotifications { get; set; } = new();
        public List<OfficeNotification> ActiveNotifications { get; set; } = new();
        public List<string> Roles { get; set; } = new();
    }
}
