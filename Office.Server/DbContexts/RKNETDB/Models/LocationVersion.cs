using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("LocationVersions")]
    public class LocationVersion
    {
        [Key]
        [Column("GUID")]
        public Guid Guid { get; set; }

        [Required]
        [Column("NAME")]
        public string Name { get; set; } = string.Empty;

        [Column("LOCATIONGUID")]
        public Guid LocationGuid { get; set; }

        [ForeignKey(nameof(LocationGuid))]
        public Location? Location { get; set; }

        [Column("OBD")]
        public int? OBD { get; set; }

        [Column("ENTITYGUID")]
        public Guid? EntityGuid { get; set; }

        [ForeignKey(nameof(EntityGuid))]
        public Entity? Entity { get; set; }

        [Column("VERSIONSTARTDATE")]
        public DateTime? VersionStartDate { get; set; }

        [Column("VERSIONENDDATE")]
        public DateTime? VersionEndDate { get; set; }

        [Column("ACTUAL")]
        public int? Actual { get; set; }

        [Column("ADDRESS")]
        public string? Address { get; set; }
    }
}
