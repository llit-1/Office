using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RKNETDB.Models
{
    /// <summary>
    /// Журнал изменений коэффициентов калькулятора: новое значение и кто поменял.
    /// В имени таблицы вторая «С» — кириллическая (так её создал старый портал).
    /// k1 — позиция на точке, k2 — позиция, k3 — точка в период.
    /// Status 2 — применено сразу, 0/1 — отложенное задание SQL Agent (ждёт/выполнено).
    /// </summary>
    [Table("CalculatorСoefficientLogs")]
    public class CalculatorCoefficientLog
    {
        [Key]
        public int Id { get; set; }
        [Column("k1")] public double? K1 { get; set; }
        [Column("k2")] public double? K2 { get; set; }
        [Column("k3")] public double? K3 { get; set; }
        public int? TT { get; set; }
        public int? SKU { get; set; }
        public Guid? TimeGroup { get; set; }
        public string Name { get; set; } = string.Empty;
        public DateTime TaskCreation { get; set; }
        public DateTime TaskExecution { get; set; }
        public string Orderer { get; set; } = string.Empty;
        public int Status { get; set; }
        public string? Task { get; set; }
    }
}
