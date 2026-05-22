using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("PersonalityVersions")]
    public class PersonalityVersion
    {
        [Key]
        [Column("GUID")]
        public Guid Guid { get; set; }

        [Required]
        [Column("NAME")]
        public string Name { get; set; } = string.Empty;

        [Required]
        [Column("SURNAME")]
        public string Surname { get; set; } = string.Empty;

        [Column("PATRONYMIC")]
        public string? Patronymic { get; set; }

        [Column("JOBTITLEGUID")]
        public Guid? JobTitleGuid { get; set; }

        [ForeignKey(nameof(JobTitleGuid))]
        public JobTitle? JobTitle { get; set; }

        [Column("LOCATIONGUID")]
        public Guid LocationGuid { get; set; }

        [ForeignKey(nameof(LocationGuid))]
        public Location? Location { get; set; }

        [Column("HIREDATE")]
        public DateTime HireDate { get; set; }

        [Column("PERSONALITIESGUID")]
        public Guid? PersonalityGuid { get; set; }

        [ForeignKey(nameof(PersonalityGuid))]
        public Personality? Personality { get; set; }

        [Column("ACTUAL")]
        public int? Actual { get; set; }

        [Column("PartTimer")]
        public int? PartTimer { get; set; }
    }
}
