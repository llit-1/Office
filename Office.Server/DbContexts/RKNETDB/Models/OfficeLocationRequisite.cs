using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    /// <summary>
    /// Реквизиты локации на период: код OBD (только у ТТ) и юрлицо.
    /// Новая версия копирует неизменённое значение, а конец прежней — день её начала.
    /// </summary>
    [Table("OfficeLocationRequisites")]
    public class OfficeLocationRequisite
    {
        [Key]
        [Column("Id")]
        public int Id { get; set; }

        [Column("OBD")]
        public int? Obd { get; set; }

        [Column("EntityGuid")]
        public Guid? EntityGuid { get; set; }

        [ForeignKey(nameof(EntityGuid))]
        public Entity? Entity { get; set; }

        [Column("Begin", TypeName = "date")]
        public DateTime Begin { get; set; }

        [Column("End", TypeName = "date")]
        public DateTime? End { get; set; }

        [Column("Location")]
        public Guid LocationGuid { get; set; }

        [ForeignKey(nameof(LocationGuid))]
        public Location? Location { get; set; }

        /// <summary>Действует на дату: начало включительно, конец — уже нет.</summary>
        public bool ActiveOn(DateTime date) => Begin <= date && (End == null || End > date);
    }
}
