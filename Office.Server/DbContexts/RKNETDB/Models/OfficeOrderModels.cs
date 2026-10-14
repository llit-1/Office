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

    /// <summary>Сдвиг дня отгрузки по правилу для всех локаций; сдвиг локации прибавляется к нему.</summary>
    public int DefaultShipmentDayOffset { get; set; }

    public ICollection<OfficeOrderItem> Items { get; set; } = new List<OfficeOrderItem>();
    public ICollection<OfficeOrderLocationRule> LocationRules { get; set; } = new List<OfficeOrderLocationRule>();
}

/// <summary>Сдвиг дня отгрузки по правилу для конкретной локации — сверх сдвига правила.</summary>
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

    /// <summary>Кратность, может быть дробной (12,5 кг); она же наименьшее количество в заказе.</summary>
    public double Step { get; set; }

    [Column("Group")]
    public int GroupId { get; set; }

    [Column("Rule")]
    public int RuleId { get; set; }

    public int AvaliableForNative { get; set; }

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

    [Column("Location")]
    public Guid LocationGuid { get; set; }

    [Column("User")]
    public int OfficeUserId { get; set; }

    [Column("Rule")]
    public int RuleId { get; set; }

    // Заказ приходит в теле запроса как есть: навигации из JSON не читаются и не проверяются.
    [JsonIgnore]
    public Location? Location { get; set; }

    [JsonIgnore]
    public OfficeUser? OfficeUser { get; set; }

    [JsonIgnore]
    public OfficeOrderRule? Rule { get; set; }

    public ICollection<OfficeOrderLine> Lines { get; set; } = new List<OfficeOrderLine>();
}

/// <summary>Строка заказа: позиция каталога и сколько её заказано.</summary>
[Table("OfficeOrderLines")]
public class OfficeOrderLine
{
    [Column("Order")]
    public int OrderId { get; set; }

    [Column("Item")]
    public int ItemId { get; set; }

    /// <summary>Количество; кратно шагу позиции, поэтому тоже может быть дробным.</summary>
    public double Quantity { get; set; }

    [JsonIgnore]
    public OfficeOrder? Order { get; set; }

    public OfficeOrderItem? Item { get; set; }
}
