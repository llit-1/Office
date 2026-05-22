using System.ComponentModel.DataAnnotations.Schema;
using System.ComponentModel.DataAnnotations;
using System;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [ComplexType]
    public class WarehouseHolder
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        [Column("ID")]
        public int Id { get; set; }

        [Column("Surname")]
        [Required]
        [StringLength(100)]
        public string Surname { get; set; }

        [Column("Name")]
        [Required]
        [StringLength(100)]
        public string Name { get; set; }

        [Column("Patronymic")]
        [StringLength(100)]
        public string? Patronymic { get; set; }

        [Column("Jobtitle")]
        [StringLength(100)]
        public string? JobTitle { get; set; }

        [Column("Department")]
        [StringLength(100)]
        public string? Department { get; set; }

        [Column("Actual")]
        public int Actual { get; set; }
    }
}
