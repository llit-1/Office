using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("FactorySKUDResultTypes")]
    public class FactorySKUDResultTypes
    {
        public int Id { get; set; }

        public string Name { get; set; } = string.Empty;

        public virtual ICollection<FactorySKUDWorkLog> FactorySKUDWorkLogs { get; set; } = new HashSet<FactorySKUDWorkLog>();
    }
}
