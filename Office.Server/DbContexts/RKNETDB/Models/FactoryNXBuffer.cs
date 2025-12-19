using System.ComponentModel.DataAnnotations.Schema;
using System.ComponentModel.DataAnnotations;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class FactoryNXBuffer
    {
        [Key, DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public int ID { get; set; }
        public int PersonID { get; set; }
        public DateTime Date { get; set; }
        public string? Photo { get; set; }
        public int Error { get; set; }
    }
}
