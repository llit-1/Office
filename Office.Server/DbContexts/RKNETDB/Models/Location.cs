using System.ComponentModel.DataAnnotations.Schema;
using System.ComponentModel.DataAnnotations;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class Location
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        [Column("GUID")]
        public Guid Guid { get; set; }
        public string Name { get; set; }
        public int? RKCode { get; set; }
        public int? AggregatorsCode { get; set; }
        public int Actual { get; set; }

        [Column("LOCATIONTYPEGUID")]
        public Guid? LocationTypeGuid { get; set; }

        // ===== Навигация =====
        [ForeignKey(nameof(LocationTypeGuid))]
        public LocationType? LocationType { get; set; }
    }

    [Table("LocationTypes")]
    public class LocationType
    {
        [Key]
        [Column("GUID")]
        public Guid Guid { get; set; }

        [Column("NAME")]
        [MaxLength(50)]
        public string Name { get; set; }

    }
}
