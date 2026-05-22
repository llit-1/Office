using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("FactoryDepartmentWorkshopJobTitle")]
    public class FactoryDepartmentWorkshopJobTitle
    {
        [Column("FactoryDepartment")]
        public int FactoryDepartmentId { get; set; }

        [Column("FactoryWorkshop")]
        public int FactoryWorkshopId { get; set; }

        [Column("FactoryJobTitle")]
        public int FactoryJobTitleId { get; set; }

        public FactoryDepartmentFactoryWorkshop DepartmentWorkshop { get; set; } = null!;
        public FactoryJobTitleFactoryWorkshop JobTitleWorkshop { get; set; } = null!;
    }
}
