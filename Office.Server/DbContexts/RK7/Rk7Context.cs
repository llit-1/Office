using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.RK7
{
    /// <summary>Справочники R-Keeper (база RK7new) для отчётов франчайзи.</summary>
    public class Rk7Context : DbContext
    {
        public Rk7Context(DbContextOptions<Rk7Context> options) : base(options)
        {
        }

        public DbSet<Rk7MenuItem> MenuItems { get; set; } // справочник товаров
        public DbSet<Rk7Currency> Currencies { get; set; } // справочник валют
        public DbSet<Rk7Restaurant> Restaurants { get; set; } // рестораны R-Keeper — источник новых ТТ
    }

    [Table("Restaurants")]
    public class Rk7Restaurant
    {
        [System.ComponentModel.DataAnnotations.Key]
        [Column("SIFR")]
        public int Sifr { get; set; }

        [Column("CODE")]
        public int? Code { get; set; }

        [Column("NAME")]
        public string? Name { get; set; }

        /// <summary>0 — удалён, 1 — черновик, 2 — неактивен, 3 — активен.</summary>
        [Column("STATUS")]
        public short? Status { get; set; }
    }

    [Keyless]
    [Table("MenuItems")]
    public class Rk7MenuItem
    {
        public int Code { get; set; }
        public string? Name { get; set; }
        public short Status { get; set; }
    }

    [Keyless]
    [Table("Currencies")]
    public class Rk7Currency
    {
        public int Sifr { get; set; }
        public string? Name { get; set; }
        public int Parent { get; set; }
    }
}
