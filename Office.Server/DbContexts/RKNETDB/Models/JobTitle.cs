using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("JobTitles")]
    public class JobTitle
    {
        [Key]
        [Column("GUID")]
        public Guid Guid { get; set; }

        [Required]
        [Column("NAME")]
        public string Name { get; set; } = string.Empty;

        [Column("SEQUENCE")]
        public int? Sequence { get; set; }
    }
}
