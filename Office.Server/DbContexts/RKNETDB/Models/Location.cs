using System.ComponentModel.DataAnnotations.Schema;
using System.ComponentModel.DataAnnotations;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class Location
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        [Column("GUID")]
        public Guid Guid { get; set; }
        public string Name { get; set; } = string.Empty;
        public int? RKCode { get; set; }
        public int? AggregatorsCode { get; set; }
        public int Actual { get; set; }

        [Column("LOCATIONTYPEGUID")]
        public Guid? LocationTypeGuid { get; set; }

        [Column("PARENTGUID")]
        public Guid? ParentGuid { get; set; }

        [Column("LATITUDE")]
        public double? Latitude { get; set; }

        [Column("LONGITUDE")]
        public double? Longitude { get; set; }

        // ===== Навигация =====
        [ForeignKey(nameof(LocationTypeGuid))]
        public LocationType? LocationType { get; set; }

        [ForeignKey(nameof(ParentGuid))]
        public Location? Parent { get; set; }
    }

    [Table("LocationTypes")]
    public class LocationType
    {
        [Key]
        [Column("GUID")]
        public Guid Guid { get; set; }

        [Column("NAME")]
        [MaxLength(50)]
        public string Name { get; set; } = string.Empty;

    }
}
