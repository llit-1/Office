using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("VideoOrientation")]
    public class VideoOrientation
    {
        [Key]
        [Column("GUID")]
        public Guid Guid { get; set; }

        public int Number { get; set; }

        public string? Name { get; set; }
    }
}
