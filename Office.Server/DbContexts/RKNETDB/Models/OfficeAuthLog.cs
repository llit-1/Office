using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("OfficeAuthLog")]
    public class OfficeAuthLog
    {
        [Key]
        [Column("Id")]
        public long Id { get; set; }

        [Required]
        [Column("OfficeUserId")]
        public int OfficeUserId { get; set; }

        [Required]
        [Column("Login")]
        [MaxLength(50)]
        public string Login { get; set; } = string.Empty;

        [Column("LoggedDate")]
        public DateTime LoggedDate { get; set; }

        [Column("IpAddress")]
        [MaxLength(64)]
        public string? IpAddress { get; set; }

        [Column("UserAgent")]
        [MaxLength(1024)]
        public string? UserAgent { get; set; }

        [Column("DeviceType")]
        [MaxLength(20)]
        public string? DeviceType { get; set; }

        [Column("DeviceOs")]
        [MaxLength(50)]
        public string? DeviceOs { get; set; }

        [Column("Browser")]
        [MaxLength(50)]
        public string? Browser { get; set; }

        [Column("BrowserVersion")]
        [MaxLength(50)]
        public string? BrowserVersion { get; set; }

        [Column("IsMobile")]
        public bool IsMobile { get; set; }

        [Column("RequestScheme")]
        [MaxLength(10)]
        public string? RequestScheme { get; set; }

        [ForeignKey(nameof(OfficeUserId))]
        public OfficeUser? OfficeUser { get; set; }
    }
}
