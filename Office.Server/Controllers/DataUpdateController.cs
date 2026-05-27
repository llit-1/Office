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
            Data? data = await _rKNETDBContext.OfficeUser
                .AsNoTracking()
                .Where(x => x.Id == userId)
                .Select(user => new Data
                {
                    NewNotifications = user.OfficeNotifications
                        .Where(x => x.Status == 0)
                        .OrderByDescending(x => x.DateTime)
                        .Select(x => new DataNotification
                        {
                            Id = x.Id,
                            DateTime = x.DateTime,
                            TypeId = x.TypeId,
                            OfficeUserId = x.OfficeUserId,
                            RelatedEntity = x.RelatedEntity,
                            Status = x.Status,
                        })
                        .ToList(),
                    ActiveNotifications = user.OfficeNotifications
                        .Where(x => x.Status == 1)
                        .OrderByDescending(x => x.DateTime)
                        .Select(x => new DataNotification
                        {
                            Id = x.Id,
                            DateTime = x.DateTime,
                            TypeId = x.TypeId,
                            OfficeUserId = x.OfficeUserId,
                            RelatedEntity = x.RelatedEntity,
                            Status = x.Status,
                        })
                        .ToList(),
                    Roles = user.OfficeGroup
                        .SelectMany(group => group.OfficeRole.Select(role => role.Role))
                        .Distinct()
                        .ToList(),
                })
                .FirstOrDefaultAsync();

            if (data == null)
            {
                return NotFound(new { message = "Пользователь не найден" });
            }

            return Ok(data);
        }
    }

    public class Data()
    {
        public List<DataNotification> NewNotifications { get; set; } = new();
        public List<DataNotification> ActiveNotifications { get; set; } = new();
        public List<string> Roles { get; set; } = new();
    }

    public class DataNotification
    {
        public int Id { get; set; }
        public DateTime DateTime { get; set; }
        public int TypeId { get; set; }
        public int OfficeUserId { get; set; }
        public int RelatedEntity { get; set; }
        public int Status { get; set; }
    }
}
