using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("OfficeBids")]
    public class OfficeBid
    {
        [Key]
        [Column("Id")]
        public int Id { get; set; }

        [Column("OfficeUser")]
        public int OfficeUserId { get; set; }

        [Column("DateTime")]
        public DateTime DateTime { get; set; }

        [Column("Status")]
        public int Status { get; set; }

        [Column("Comment")]
        [StringLength(350)]
        public string? Comment { get; set; }

        // Navigation property
        [ForeignKey(nameof(OfficeUserId))]
        public virtual OfficeUser OfficeUser { get; set; } = null!;
    }
}
