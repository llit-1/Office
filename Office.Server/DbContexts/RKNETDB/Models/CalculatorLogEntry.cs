using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    /// <summary>
    /// Строка ввода калькулятора розницы. Office пишет её сам, старый портал — через сервис Buffer.
    /// По журналу — последние значения захода и статусы категорий. Строки — nchar, с хвостовыми пробелами.
    /// Индекс только по Id, который растёт вместе с Date: свежие строки ищем по диапазону Id.
    /// </summary>
    [Table("CalculatorLogsTest")]
    public class CalculatorLogEntry
    {
        [Key]
        public int Id { get; set; }
        public string UserName { get; set; } = string.Empty;
        public int ItemCode { get; set; }
        public string ItemName { get; set; } = string.Empty;
        public int TTCode { get; set; }
        public string TTName { get; set; } = string.Empty;
        public int? Rest { get; set; }
        /// <summary>План; -1 — позицию заблокировали.</summary>
        public int Result { get; set; }
        public int? Fact { get; set; }
        public DateTime Date { get; set; }
        public Guid? SessionId { get; set; }
    }
}
