using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class FactoryCitizenship
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;

        [Column("CitizenshipType")]
        public int? CitizenshipTypeId { get; set; }

        [ForeignKey(nameof(CitizenshipTypeId))]
        public FactoryCitizenshipType? CitizenshipType { get; set; }
    }
}
