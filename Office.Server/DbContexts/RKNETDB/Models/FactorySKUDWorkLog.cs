using System;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    [Table("FactorySKUDWorkLog")]
    public class FactorySKUDWorkLog
    {
        public int Id { get; set; }

        public string CardNumber { get; set; } = string.Empty;

        public string ReaderIP { get; set; } = string.Empty;

        [Column("Reader")]
        public int? ReaderId { get; set; }

        [Column("Person")]
        public int? PersonId { get; set; }

        [Column("ResultType")]
        public int ResultTypeId { get; set; }

        public DateTime DateTime { get; set; }

        public string? HexStr { get; set; }

        [ForeignKey(nameof(PersonId))]
        public virtual FactoryPerson? Person { get; set; }

        [ForeignKey(nameof(ReaderId))]
        public virtual FactorySKUDReader? Reader { get; set; }

        [ForeignKey(nameof(ResultTypeId))]
        public virtual FactorySKUDResultTypes? ResultType { get; set; }
    }
}
