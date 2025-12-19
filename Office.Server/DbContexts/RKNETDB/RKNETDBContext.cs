using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB.Models;
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
            //modelBuilder.Entity<OfficeGroupRole>().HasKey(c => new { c.OfficeRoleId, c.OfficeGroupId });
            //modelBuilder.Entity<OfficeGroupRole>()
            //    .HasOne(c => c.OfficeRole)
            //    .WithMany(c => c.OfficeGroupRole)
            //    .HasForeignKey(c => c.OfficeRoleId);
            //modelBuilder.Entity<OfficeGroupRole>()
            //    .HasOne(c => c.OfficeGroup)
            //    .WithMany(c => c.OfficeGroupRole)
            //    .HasForeignKey(c => c.OfficeGroupId);
        }

        public DbSet<DbContexts.RKNETDB.Models.Location> Locations { get; set; } // локация
        public DbSet<DbContexts.RKNETDB.Models.OfficeUser> OfficeUser { get; set; } //пользователь
        public DbSet<DbContexts.RKNETDB.Models.FactoryNXBuffer> FactoryNXBuffer { get; set; } //Логи NX Завод
        public DbSet<DbContexts.RKNETDB.Models.FactoryPerson> FactoryPerson { get; set; } //Сотрудники Завод
        public DbSet<DbContexts.RKNETDB.Models.OfficeRole> OfficeRole { get; set; }
        public DbSet<DbContexts.RKNETDB.Models.OfficeGroup> OfficeGroup { get; set; }

    }
}
