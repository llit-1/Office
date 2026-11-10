using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    /// <summary>
    /// Окно захода в калькулятор: когда точка вводит остатки по категории.
    /// TTCode null — для всех точек; если у точки есть свои окна по категории, действуют только они.
    /// Время — минуты от начала суток, конец не включается.
    /// </summary>
    [Table("OfficeCalculatorEntryWindows")]
    public class OfficeCalculatorEntryWindow
    {
        [Key]
        public int Id { get; set; }
        [MaxLength(32)]
        public string Category { get; set; } = string.Empty;
        public int? TTCode { get; set; }
        public int StartMinute { get; set; }
        public int EndMinute { get; set; }
    }
}
