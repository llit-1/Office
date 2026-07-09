using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.PowerBi.Models
{
    [Table("SensorData")]
    public class SensorDataPoint
    {
        [Key]
        public int Id { get; set; }

        public int RoomId { get; set; }

        [Required]
        [StringLength(80)]
        public string RoomName { get; set; } = string.Empty;

        public int? Temperature { get; set; }

        public int? Humidity { get; set; }

        [Column("Date")]
        public DateTime Date { get; set; }
    }
}
