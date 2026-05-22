using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    public class FactoryDocument
    {
        public int Id { get; set; }
        public string Number { get; set; } = string.Empty;

        [Column("DocumentType")]
        public int? DocumentTypeId { get; set; }

        [ForeignKey(nameof(DocumentTypeId))]
        public FactoryDocumentType? DocumentType { get; set; }
    }
}
