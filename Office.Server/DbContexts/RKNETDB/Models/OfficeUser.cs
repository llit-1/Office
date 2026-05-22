using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class OfficeUser
    {
        [Key]
        [Column("Id")]
        public int Id { get; set; }

        [Required]
        [Column("Login")]
        [MaxLength(50)]
        public string Login { get; set; } = string.Empty;

        [Column("Name")]
        [MaxLength(50)]
        public string? Name { get; set; }

        [Column("Surname")]
        [MaxLength(50)]
        public string? Surname { get; set; }

        [Column("Patronymic")]
        [MaxLength(50)]
        public string? Patronymic { get; set; }

        [Column("Position")]
        [MaxLength(50)]
        public string? Position { get; set; }

        [Column("Actual")]
        public int Actual { get; set; }

        [Column("DefaultLocations")]
        public int DefaultLocations { get; set; }

        // FK → FactoryPerson.Id
        [Column("FactoryPerson")]
        public int? FactoryPersonId { get; set; }

        // FK → Personalities.GUID
        [Column("Personalities")]
        public Guid? PersonalitiesGuid { get; set; }

        // ======================
        // Навигации
        // ======================
        [ForeignKey(nameof(FactoryPersonId))]
        public FactoryPerson? FactoryPerson { get; set; }

        [ForeignKey(nameof(PersonalitiesGuid))]
        public Personality? Personality { get; set; }
        public virtual List<OfficeGroup> OfficeGroup { get; set; }
        public virtual List<Location> Locations { get; set; }

        public OfficeUser()
        {
            OfficeGroup = new List<OfficeGroup>();
            Locations = new List<Location>();
        }

        public OfficeUser(string login, string? name): this()
        {
            Login = login;
            Name = name;
        }

        public OfficeUser(string login, string? name, string? password) : this()
        {
            Login = login;
            Name = name;
        }
    }
}
  