using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.Reflection.Emit;

namespace Office.Server.DbContexts.RKNETDB
{
    public class RKNETDBContext : DbContext
    {
        public RKNETDBContext(DbContextOptions<RKNETDBContext> options) : base(options) { }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
        }

        public DbSet<DbContexts.RKNETDB.Models.Location> Locations { get; set; } // локация
        public DbSet<DbContexts.RKNETDB.Models.OfficeUser> OfficeUser { get; set; } //пользователь

    }
}
