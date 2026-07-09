using System.ComponentModel.DataAnnotations.Schema;
using System.ComponentModel.DataAnnotations;

namespace Office.Server.DbContexts.PowerBi.Models
{
    [Table("SensorChatUsers")]
    public class SensorChatUser
    {
        [Column("ChatId")]
        public int ChatId { get; set; }

        [Required]
        [Column("UserLogin")]
        [StringLength(50)]
        public string UserLogin { get; set; } = string.Empty;

        [Column("DisplayName")]
        [StringLength(150)]
        public string? DisplayName { get; set; }
    }
}
