using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.Reports1C
{
    /// <summary>Выгрузки 1С (база SQL_BASE_Reports_1c) для отчётов франчайзи.</summary>
    public class Reports1CContext : DbContext
    {
        public Reports1CContext(DbContextOptions<Reports1CContext> options) : base(options)
        {
        }

        public DbSet<MarriageOnTT> MarriagesOnTT { get; set; } // акты брака
        public DbSet<ShipmentByGP> ShipmentsByGP { get; set; } // отгрузка
        public DbSet<StrikeItOut> StrikeItOut { get; set; } // вычерки
    }

    [Keyless]
    [Table("MarriagesOnTT")]
    public class MarriageOnTT
    {
        public DateTime? Date { get; set; }
        public string? Article { get; set; }
        public string? Nomenclature { get; set; }
        public decimal? Quantity { get; set; }
        public string? ReasonMarriage { get; set; }
        public decimal? StorageUnitstatesWeight { get; set; }
        public int CounterpartyCode { get; set; }
    }

    [Keyless]
    [Table("ShipmentsByGP")]
    public class ShipmentByGP
    {
        public DateTime DateOfShipmentChange { get; set; }
        public string? Parent { get; set; }
        public string? Article { get; set; }
        public string? Nomenclature { get; set; }
        public decimal? Quantity { get; set; }
        public string? Warehouse { get; set; }
        public decimal? OrderPrice { get; set; }
        public decimal? ConsigneeCodeN { get; set; }
    }

    [Keyless]
    [Table("StrikeItOut")]
    public class StrikeItOut
    {
        public DateTime Date { get; set; }
        public string? Article { get; set; }
        public decimal? ConsigneeCodeN { get; set; }
        public string? WarehouseRecorder { get; set; }
        public decimal? Quantity { get; set; }
        public decimal? Amount { get; set; }
        public string? ReasonForReturn { get; set; }
    }
}
