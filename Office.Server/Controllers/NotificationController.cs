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
            List<NotificationDto> officeNotifications = await _rKNETDBContext.OfficeNotifications
                .Include(x => x.OfficeNotificationType)
                .AsNoTracking()
                .Where(x => x.OfficeUserId == userId && (x.Status == 0 || x.Status == 1))
                .OrderByDescending(x => x.DateTime)
                .Select(x => new NotificationDto
                {
                    Id = x.Id,
                    DateTime = x.DateTime,
                    TypeId = x.TypeId,
                    OfficeNotificationType = x.OfficeNotificationType,
                    OfficeUserId = x.OfficeUserId,
                    RelatedEntity = x.RelatedEntity,
                    Status = x.Status,
                })
                .ToListAsync();

            await FillRelatedEntityDataAsync(officeNotifications);

            return Ok(officeNotifications);
        }

        [HttpGet("getinactivenotifications")]
        public async Task<ActionResult> GetInactiveNotifications(int userId)
        {
            List<NotificationDto> officeNotifications = await _rKNETDBContext.OfficeNotifications
                .Include(x => x.OfficeNotificationType)
                .AsNoTracking()
                .Where(x => x.OfficeUserId == userId && x.Status == 2)
                .OrderByDescending(x => x.DateTime)
                .Select(x => new NotificationDto
                {
                    Id = x.Id,
                    DateTime = x.DateTime,
                    TypeId = x.TypeId,
                    OfficeNotificationType = x.OfficeNotificationType,
                    OfficeUserId = x.OfficeUserId,
                    RelatedEntity = x.RelatedEntity,
                    Status = x.Status,
                })
                .ToListAsync();

            await FillRelatedEntityDataAsync(officeNotifications);

            return Ok(officeNotifications);
        }

        private async Task FillRelatedEntityDataAsync(List<NotificationDto> officeNotifications)
        {
            foreach (var item in officeNotifications)
            {
                switch (item.TypeId)
                {
                    case 1:
                    case 2:
                    {
                        OfficeBid? officeBid = await _rKNETDBContext.OfficeBids
                            .Include(x => x.OfficeUser)
                            .AsNoTracking()
                            .FirstOrDefaultAsync(x => x.Id == item.RelatedEntity);

                        item.RelatedEntityData = officeBid is not null
                            ? officeBid
                            : $"OfficeBid #{item.RelatedEntity}";
                        break;
                    }
                    default:
                        item.RelatedEntityData = item.RelatedEntity.ToString();
                        break;
                }
            }
        }

        [HttpPost("setnotificationsstatusone")]
        public async Task<ActionResult> SetNotificationsStatusOne([FromBody] List<int> notificationIds)
        {
            List<OfficeNotification> officeNotifications = await _rKNETDBContext.OfficeNotifications
                .Where(x => notificationIds.Contains(x.Id))
                .ToListAsync();

            foreach (var item in officeNotifications)
            {
                item.Status = 1;
            }

            await _rKNETDBContext.SaveChangesAsync();
            return Ok();
        }

        [HttpPost("setnotificationsstatustwo")]
        public async Task<ActionResult> SetNotificationsStatustTwo([FromBody] int notificationId)
        {
            OfficeNotification? officeNotification = await _rKNETDBContext.OfficeNotifications
                .FirstOrDefaultAsync(x => notificationId == x.Id);

            if (officeNotification == null)
            {
                return NotFound(new { message = "Notification is not found" });
            }

            officeNotification.Status = 2;
            await _rKNETDBContext.SaveChangesAsync();
            return Ok();
        }

        public class NotificationDto
        {
            public int Id { get; set; }
            public DateTime DateTime { get; set; }
            public int TypeId { get; set; }
            public OfficeNotificationType OfficeNotificationType { get; set; } = new();
            public int OfficeUserId { get; set; }
            public int RelatedEntity { get; set; }
            public int Status { get; set; }
            public object? RelatedEntityData { get; set; }
        }
    }
}
