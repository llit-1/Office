using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.PowerBi.Models
{
    [Table("SensorMaintenanceWindows")]
    public class SensorMaintenanceWindow
    {
        [Key]
        public int Id { get; set; }

        [Column("RoomId")]
        public int RoomId { get; set; }

        [Required]
        [StringLength(120)]
        public string Name { get; set; } = string.Empty;

        [Required]
        [StringLength(20)]
        public string ScheduleType { get; set; } = string.Empty;

        public int? DaysOfWeekMask { get; set; }

        public TimeSpan StartTime { get; set; }

        public TimeSpan EndTime { get; set; }

        public DateTime? StartDate { get; set; }

        public DateTime? EndDate { get; set; }

        public bool IsEnabled { get; set; }
    }
}
