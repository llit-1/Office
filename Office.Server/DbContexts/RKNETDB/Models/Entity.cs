using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("Entity")]
    public class Entity
    {
        [Key]
        [Column("GUID")]
        public Guid Guid { get; set; }

        [Column("NAME")]
        public string Name { get; set; } = string.Empty;

        [Column("OWNER")]
        public int Owner { get; set; }
    }
}
