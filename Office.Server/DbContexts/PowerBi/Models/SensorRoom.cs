using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.PowerBi.Models
{
    [Table("SensorRooms")]
    public class SensorRoom
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [StringLength(60)]
        public string Name { get; set; } = string.Empty;

        [Required]
        [Column("IP")]
        [StringLength(20)]
        public string Ip { get; set; } = string.Empty;

        public int? Temp { get; set; }

        [Column("actual")]
        public int? Actual { get; set; }

        [StringLength(50)]
        public string? State { get; set; }
    }
}
