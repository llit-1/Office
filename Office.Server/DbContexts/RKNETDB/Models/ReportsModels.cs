using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    /// <summary>Ссылки и пути раздела «Отчёты». OfficeUserId = null — общее значение, иначе персональное.</summary>
    [Table("OfficeReportSettings")]
    public class OfficeReportSetting
    {
        [Key]
        public int Id { get; set; }

        [Required]
        [MaxLength(40)]
        public string ReportCode { get; set; } = string.Empty;

        public int? OfficeUserId { get; set; }

        [Required]
        [MaxLength(2000)]
        public string Value { get; set; } = string.Empty;

        public DateTime UpdatedAtUtc { get; set; }

        [MaxLength(50)]
        public string? UpdatedBy { get; set; }
    }

    /// <summary>Позиции чеков R-Keeper (продажи, списания, возвраты, инвентаризация).</summary>
    [Keyless]
    [Table("SaleObjects")]
    public class SaleObject
    {
        public int Midserver { get; set; }
        public int Visit { get; set; }
        public int Code { get; set; }

        [Column(TypeName = "money")]
        public decimal SumWithDiscount { get; set; }

        public double Quantity { get; set; }
        public DateTime Date { get; set; }
        public int Currency { get; set; }
        public int? Restaurant { get; set; }
        public int Deleted { get; set; }
    }

    /// <summary>Позиции заказов агрегаторов доставки.</summary>
    [Keyless]
    [Table("SaleObjectsAgregators")]
    public class SaleObjectAgregator
    {
        public int Midserver { get; set; }
        public int Code { get; set; }

        [Column(TypeName = "money")]
        public decimal SumWithDiscount { get; set; }

        public int Quantity { get; set; }
        public DateTime Date { get; set; }
        public string? OrderNumber { get; set; }
        public int Currency { get; set; }
        public int? Restaurant { get; set; }
        public int Deleted { get; set; }
    }

    /// <summary>Тип валюты R-Keeper: 0 — продажа.</summary>
    [Table("CurrencyTypes")]
    public class CurrencyType
    {
        [Key]
        [DatabaseGenerated(DatabaseGeneratedOption.None)]
        public int Rk7CurrencyType { get; set; }

        public int Type { get; set; }
    }

    /// <summary>Последний пользователь, открывший отчёт «Выручка».</summary>
    [Table("LastUser")]
    public class LastUser
    {
        [Key]
        public int Id { get; set; }

        public string? User { get; set; }
    }
}
