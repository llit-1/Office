using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("FactoryDepartmentFactoryWorkshop")]
    public class FactoryDepartmentFactoryWorkshop
    {
        [Column("FactoryDepartment")]
        public int FactoryDepartmentId { get; set; }

        [Column("FactoryWorkshop")]
        public int FactoryWorkshopId { get; set; }

        public FactoryDepartment FactoryDepartment { get; set; } = null!;
        public FactoryWorkshop FactoryWorkshop { get; set; } = null!;

        public ICollection<FactoryDepartmentWorkshopJobTitle> DepartmentWorkshopJobTitles { get; set; } = new List<FactoryDepartmentWorkshopJobTitle>();
    }
}
