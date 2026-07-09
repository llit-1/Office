using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.PowerBi.Models
{
    [Table("SensorAlertSettings")]
    public class SensorAlertSetting
    {
        [Key]
        [Column("RoomId")]
        public int RoomId { get; set; }

        [Column(TypeName = "decimal(5,1)")]
        public decimal? MinTemperature { get; set; }

        [Column(TypeName = "decimal(5,1)")]
        public decimal? MaxTemperature { get; set; }

        public int ViolationDelayMinutes { get; set; }

        public int RepeatDelayMinutes { get; set; }

        public int RecoveryDelayMinutes { get; set; }

        public bool IsEnabled { get; set; }
    }
}
