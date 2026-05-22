using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("FactoryWorkshop")]
    public class FactoryWorkshop
    {
        [Key]
        [Column("Id")]
        public int Id { get; set; }

        [Column("Name")]
        public string Name { get; set; } = string.Empty;

        public ICollection<FactoryDepartmentFactoryWorkshop> DepartmentWorkshops { get; set; } = new List<FactoryDepartmentFactoryWorkshop>();
        public ICollection<FactoryJobTitleFactoryWorkshop> JobTitleWorkshops { get; set; } = new List<FactoryJobTitleFactoryWorkshop>();
        public ICollection<FactoryDepartmentWorkshopJobTitle> DepartmentWorkshopJobTitles { get; set; } = new List<FactoryDepartmentWorkshopJobTitle>();
    }
}
