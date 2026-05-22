using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("FactoryJobTitleFactoryWorkshop")]
    public class FactoryJobTitleFactoryWorkshop
    {
        [Column("FactoryJobTitle")]
        public int FactoryJobTitleId { get; set; }

        [Column("FactoryWorkshop")]
        public int FactoryWorkshopId { get; set; }

        public FactoryJobTitle FactoryJobTitle { get; set; } = null!;
        public FactoryWorkshop FactoryWorkshop { get; set; } = null!;

        public ICollection<FactoryDepartmentWorkshopJobTitle> DepartmentWorkshopJobTitles { get; set; } = new List<FactoryDepartmentWorkshopJobTitle>();
    }
}
