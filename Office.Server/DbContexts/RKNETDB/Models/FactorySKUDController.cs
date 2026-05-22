using System.Collections.Generic;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("FactorySKUDController")]
    public class FactorySKUDController
    {
        public int Id { get; set; }

        public string Name { get; set; } = string.Empty;

        public string Ip { get; set; } = string.Empty;

        public int Pwd { get; set; }

        public virtual ICollection<FactorySKUDReader> FactorySKUDReaders { get; set; } = new HashSet<FactorySKUDReader>();
    }
}
