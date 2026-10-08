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
