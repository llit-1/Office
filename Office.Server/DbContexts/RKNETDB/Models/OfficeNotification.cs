using Office.Server.DbContexts.RKNETDB.Models;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models;
[Table("OfficeNotifications")]
public class OfficeNotification
{
    [Key]
    [Column("Id")]
    public int Id { get; set; }

    [Column("DateTime")]
    public DateTime DateTime { get; set; }

    [Column("Type")]
    public int TypeId { get; set; }

    [Column("OfficeUser")]
    public int OfficeUserId { get; set; }

    [Column("RelatedEntity")]
    public int RelatedEntity { get; set; }

    [Column("Status")]
    public int Status { get; set; }


    // Navigation properties

    [ForeignKey(nameof(TypeId))]
    public virtual OfficeNotificationType OfficeNotificationType { get; set; } = null!;
}