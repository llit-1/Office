using System.ComponentModel.DataAnnotations.Schema;
using System.ComponentModel.DataAnnotations;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("FactoryPerson")]
    public class FactoryPerson
    {
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        [Key, Column("Id")]
        public int Id { get; set; }

        [Required, MaxLength(50), Column("Surname")]
        public string Surname { get; set; } = string.Empty;

        [Required, MaxLength(50), Column("Name")]
        public string Name { get; set; } = string.Empty;

        [MaxLength(50), Column("Patronymic")]
        public string? Patronymic { get; set; }

        [Required, Column("Birthdate", TypeName = "date")]
        public DateTime Birthdate { get; set; }

        [Required, MaxLength(25), Column("Passport")]
        public string Passport { get; set; } = string.Empty;

        [Column("PassportDate")]
        public DateTime? PassportDate { get; set; }

        [Column("FactoryCitizenship")]
        public int FactoryCitizenship { get; set; }

        [Column("FactoryEntity")]
        public int FactoryEntity { get; set; }

        [Column("FactoryDocumentType")]
        public int FactoryDocumentType { get; set; }

        [Column("FactoryDepartment")]
        public int? FactoryDepartment { get; set; }

        [Column("FactoryWorkshop")]
        public int? FactoryWorkshop { get; set; }

        [Column("FactoryJobTitle")]
        public int? FactoryJobTitle { get; set; }

        [MaxLength(10), Column("Phone")]
        public string? Phone { get; set; }

        [MaxLength(16), Column("CardNumber")]
        public string? CardNumber { get; set; }

        [Column("FactoryBanks")]
        public int? FactoryBanks { get; set; }

        [ForeignKey("FactoryBanks")]
        public FactoryBanks? Bank { get; set; }

        [ForeignKey("FactoryCitizenship")]
        public FactoryCitizenship? Citizenship { get; set; }

        [ForeignKey("FactoryEntity")]
        public FactoryEntity? Entity { get; set; }

        [ForeignKey("FactoryDocumentType")]
        public FactoryDocumentType? DocumentType { get; set; }

        [Column("HostelChekin", TypeName = "date")]
        public DateTime? HostelChekin { get; set; }

        [Column("HostelCheckOut", TypeName = "date")]
        public DateTime? HostelCheckOut { get; set; }

        [Required, Column("HiringDate", TypeName = "date")]
        public DateTime HiringDate { get; set; }

        [Column("DismissedDate", TypeName = "date")]
        public DateTime? DismissedDate { get; set; }

        [Column("Photo")]
        public string? Photo { get; set; }

        [Column("PassCardNumber"), MaxLength(10)]
        public string? PassCardNumber { get; set; }

        [Column("SKUDGroup")]
        public int? SKUDGroupId { get; set; }
        
        [Column("Fake")]
        public bool? Fake { get; set; }

    }
}
