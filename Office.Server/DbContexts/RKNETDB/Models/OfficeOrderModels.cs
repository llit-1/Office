using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace Office.Server.DbContexts.RKNETDB.Models;

/// <summary>Правило заказа: расписание приёма заявок и расписание отгрузки.</summary>
[Table("OfficeOrderRules")]
public class OfficeOrderRule
{
    [Key]
    public int Id { get; set; }

    [MaxLength(100)]
    public string Name { get; set; } = string.Empty;

    [MaxLength(20)]
    public string Interval { get; set; } = string.Empty;

    [MaxLength(20)]
    public string ShipmentInterval { get; set; } = string.Empty;

    public ICollection<OfficeOrderItem> Items { get; set; } = new List<OfficeOrderItem>();
    public ICollection<OfficeOrderLocationRule> LocationRules { get; set; } = new List<OfficeOrderLocationRule>();
}

/// <summary>Сдвиг дня отгрузки по правилу для конкретной локации.</summary>
[Table("OfficeOrderLocationRule")]
public class OfficeOrderLocationRule
{
    [Column("Location")]
    public Guid LocationGuid { get; set; }

    [Column("Rule")]
    public int RuleId { get; set; }

    public int ShipmentDayOffset { get; set; }

    public Location Location { get; set; } = null!;
    public OfficeOrderRule Rule { get; set; } = null!;
}

[Table("OfficeOrderGroup")]
public class OfficeOrderGroup
{
    [Key]
    public int Id { get; set; }

    [MaxLength(200)]
    public string Name { get; set; } = string.Empty;

    public ICollection<OfficeOrderItem> Items { get; set; } = new List<OfficeOrderItem>();
}

[Table("OfficeOrderItem")]
public class OfficeOrderItem
{
    [Key]
    public int Id { get; set; }

    public int? Rkcode { get; set; }

    [MaxLength(200)]
    public string? Name { get; set; }

    public int MinValue { get; set; }
    public int Step { get; set; }

    [Column("Group")]
    public int GroupId { get; set; }

    [Column("Rule")]
    public int RuleId { get; set; }

    public int AvaliableForNative { get; set; }
    public int AvaliableForFranchise { get; set; }

    /// <summary>0 — позиция удалена.</summary>
    public int Actual { get; set; } = 1;

    // Позиция приходит в теле запроса как есть: навигации из JSON не читаются и не проверяются.
    [JsonIgnore]
    public OfficeOrderGroup? Group { get; set; }

    [JsonIgnore]
    public OfficeOrderRule? Rule { get; set; }
}

[Table("OfficeOrder")]
public class OfficeOrder
{
    [Key]
    public int Id { get; set; }

    [Column(TypeName = "datetime")]
    public DateTime CreationDateTime { get; set; }

    public DateOnly ShipmentDate { get; set; }

    [Column("Location")]
    public Guid LocationGuid { get; set; }

    [Column("User")]
    public int OfficeUserId { get; set; }

    public Location Location { get; set; } = null!;
    public OfficeUser OfficeUser { get; set; } = null!;
    public ICollection<OfficeOrderItem> Items { get; set; } = new List<OfficeOrderItem>();
}
