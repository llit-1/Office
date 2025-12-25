using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("Personalities")]
    public class Personality
    {
        [Key]
        [Column("GUID")]
        public Guid Guid { get; set; }

        [Required]
        [Column("NAME")]
        [MaxLength(50)]
        public string Name { get; set; } = "";

        [Column("BIRTHDATE")]
        public DateTime Birthdate { get; set; }

        [Column("Phone")]
        [MaxLength(10)]
        public string? Phone { get; set; }

        [Column("Password")]
        [MaxLength(64)]
        public string? Password { get; set; }

        [Column("PhoneCode")]
        [MaxLength(4)]
        public string? PhoneCode { get; set; }

        [Column("LastPhoneCall")]
        public DateTime? LastPhoneCall { get; set; }

        [Column("PhoneCallAttempts")]
        public int? PhoneCallAttempts { get; set; }

        [Column("INN")]
        [MaxLength(50)]
        public string? INN { get; set; }

        [Column("SNILS")]
        [MaxLength(50)]
        public string? SNILS { get; set; }

        [Column("LMKID")]
        public int? LMKID { get; set; }

        [Column("PersonalityCitizenship")]
        public int? PersonalityCitizenshipId { get; set; }

    }
}
