using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("VideoInfo")]
    public class VideoInfo
    {
        [Key]
        [Column("GUID")]
        public Guid Guid { get; set; }

        public string Name { get; set; } = string.Empty;

        public string? Path { get; set; }

        public int Position { get; set; }
    }
}
