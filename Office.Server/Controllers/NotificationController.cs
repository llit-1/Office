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
            List<NotificationDto>? officeNotifications = await _rKNETDBContext.OfficeUser
                .AsNoTracking()
                .Where(x => x.Id == userId)
                .Select(user => user.OfficeNotifications
                    .Where(x => x.Status == 0 || x.Status == 1)
                    .OrderByDescending(x => x.DateTime)
                    .Select(x => new NotificationDto
                    {
                        Id = x.Id,
                        DateTime = x.DateTime,
                        TypeId = x.TypeId,
                        OfficeUserId = x.OfficeUserId,
                        RelatedEntity = x.RelatedEntity,
                        Status = x.Status,
                    })
                    .ToList())
                .FirstOrDefaultAsync();

            if (officeNotifications == null)
            {
                return NotFound(new { message = "Пользователь не найден" });
            }

            return Ok(officeNotifications);
        }

        [HttpGet("getinactivenotifications")]
        public async Task<ActionResult> GetInactiveNotifications(int userId)
        {
            List<NotificationDto>? officeNotifications = await _rKNETDBContext.OfficeUser
                .AsNoTracking()
                .Where(x => x.Id == userId)
                .Select(user => user.OfficeNotifications
                    .Where(x => x.Status == 2)
                    .OrderByDescending(x => x.DateTime)
                    .Select(x => new NotificationDto
                    {
                        Id = x.Id,
                        DateTime = x.DateTime,
                        TypeId = x.TypeId,
                        OfficeUserId = x.OfficeUserId,
                        RelatedEntity = x.RelatedEntity,
                        Status = x.Status,
                    })
                    .ToList())
                .FirstOrDefaultAsync();

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

    public class NotificationDto
    {
        public int Id { get; set; }
        public DateTime DateTime { get; set; }
        public int TypeId { get; set; }
        public int OfficeUserId { get; set; }
        public int RelatedEntity { get; set; }
        public int Status { get; set; }
    }
}
