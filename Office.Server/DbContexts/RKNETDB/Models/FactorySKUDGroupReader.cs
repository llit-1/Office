using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    /// <summary>Считыватель, через который пускают сотрудников группы СКУД.</summary>
    [Table("FactorySKUDGroupReader")]
    public class FactorySKUDGroupReader
    {
        [Column("Group")]
        public int GroupId { get; set; }

        [Column("Reader")]
        public int ReaderId { get; set; }
    }
}
