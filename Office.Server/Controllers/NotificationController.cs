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
    public class NotificationController : ControllerBase
    {
        private readonly RKNETDBContext _rKNETDBContext;
        public NotificationController(RKNETDBContext rKNETDBContext)
        {
            _rKNETDBContext = rKNETDBContext;
        }


        [HttpGet("getactivenotifications")]
        public async Task<ActionResult> GetActiveNotifications(int userId)
        {
            List<OfficeNotification> officeNotifications = _rKNETDBContext.OfficeNotifications
                 .Include(x => x.OfficeNotificationType)
                 .Where(x => x.OfficeUserId == userId)
                 .Where(x => x.Status == 0 || x.Status == 1)
                 .OrderByDescending(x => x.DateTime).ToList();
            if (officeNotifications == null)
            {
                return NotFound(new { message = "Пользователь не найден" });
            }
            return Ok(officeNotifications);
        }

        [HttpGet("getinactivenotifications")]
        public async Task<ActionResult> GetInactiveNotifications(int userId)
        {
            List<OfficeNotification> officeNotifications = _rKNETDBContext.OfficeNotifications
                .Include(x => x.OfficeNotificationType)
                .Where(x => x.OfficeUserId == userId)
                .Where(x => x.Status == 2)
                .OrderByDescending(x => x.DateTime).ToList();
            if (officeNotifications == null)
            {
                return NotFound(new { message = "Пользователь не найден" });
            }
            return Ok(officeNotifications);
        }

        [HttpPost("setnotificationsstatusone")]
        public async Task<ActionResult> SetNotificationsStatusOne([FromBody] List<int> notificationIds)
        {
            List<OfficeNotification> officeNotifications = _rKNETDBContext.OfficeNotifications.Where(x => notificationIds.Contains(x.Id)).ToList();
            foreach (var item in officeNotifications)
            {
                item.Status = 1;
            }
            _rKNETDBContext.SaveChanges();
            return Ok();
        }

        [HttpPost("setnotificationsstatustwo")]
        public async Task<ActionResult> SetNotificationsStatustTwo([FromBody] int notificationId)
        {
            OfficeNotification officeNotification = _rKNETDBContext.OfficeNotifications.FirstOrDefault(x => notificationId == x.Id);
            if (officeNotification == null)
            {
                return NotFound(new { message = "Notification is not found" });
            }
            officeNotification.Status = 2;
            _rKNETDBContext.SaveChanges();
            return Ok();
        }

    }
}
