using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("FactorySKUDReader")]
    public class FactorySKUDReader
    {
        public int Id { get; set; }

        public string Name { get; set; } = string.Empty;

        public string? Ip { get; set; }

        public int? ControllerId { get; set; }

        public int Relay { get; set; }

        public int CommandType { get; set; }

        public int CommandTime { get; set; }

        public string? SecurityMonitor { get; set; }

        public virtual FactorySKUDController? Controller { get; set; }

        public virtual ICollection<FactorySKUDWorkLog> FactorySKUDWorkLogs { get; set; } = new HashSet<FactorySKUDWorkLog>();
    }
}
