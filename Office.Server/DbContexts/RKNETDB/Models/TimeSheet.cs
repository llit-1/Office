using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("TimeSheets")]
    public class TimeSheet
    {
        [Key]
        [Column("GUID")]
        public Guid Guid { get; set; }

        [Column("PERSONALITIESGUID")]
        public Guid PersonalityGuid { get; set; }

        [ForeignKey(nameof(PersonalityGuid))]
        public Personality? Personalities { get; set; }

        [Column("LOCATIONGUID")]
        public Guid LocationGuid { get; set; }

        [ForeignKey(nameof(LocationGuid))]
        public Location? Location { get; set; }

        [Column("JOBTITLEGUID")]
        public Guid? JobTitleGuid { get; set; }

        [ForeignKey(nameof(JobTitleGuid))]
        public JobTitle? JobTitle { get; set; }

        [Column("BEGIN")]
        public DateTime Begin { get; set; }

        [Column("END")]
        public DateTime End { get; set; }

        public int? Absence { get; set; }

        public decimal? BaseRate { get; set; }

        public decimal? LocationCashBonus { get; set; }

        public decimal? ExperienceCashBonus { get; set; }

        public decimal? PersonalCashBonus { get; set; }

        public decimal? TotalSalary { get; set; }
    }
}
