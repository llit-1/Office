using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.DbContexts.RKNETDB
{
    public class RKNETDBContext : DbContext
    {
        public RKNETDBContext(DbContextOptions<RKNETDBContext> options) : base(options) { }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // ===== OfficeUser ↔ Locations =====
            modelBuilder.Entity<OfficeUser>()
                .HasMany(u => u.Locations)
                .WithMany()
                .UsingEntity<Dictionary<string, object>>(
                    "OfficeUserLocation",
                    j => j
                        .HasOne<Location>()
                        .WithMany()
                        .HasForeignKey("LocationGUID")
                        .HasPrincipalKey(l => l.Guid),
                    j => j
                        .HasOne<OfficeUser>()
                        .WithMany()
                        .HasForeignKey("OfficeUserId")
                        .HasPrincipalKey(u => u.Id),
                    j =>
                    {
                        j.ToTable("OfficeUserLocation");
                        j.HasKey("OfficeUserId", "LocationGUID");
                    });

            // ===== OfficeUser ↔ OfficeGroup =====
            modelBuilder.Entity<OfficeUser>()
                .HasMany(u => u.OfficeGroup)
                .WithMany()
                .UsingEntity<Dictionary<string, object>>(
                    "OfficeGroupOfficeUser",
                    j => j
                        .HasOne<OfficeGroup>()
                        .WithMany()
                        .HasForeignKey("OfficeGroupID")
                        .HasPrincipalKey(g => g.ID),
                    j => j
                        .HasOne<OfficeUser>()
                        .WithMany()
                        .HasForeignKey("OfficeUserId")
                        .HasPrincipalKey(u => u.Id),
                    j =>
                    {
                        j.ToTable("OfficeGroupOfficeUser");
                        j.HasKey("OfficeUserId", "OfficeGroupID");
                    });

            // ===== OfficeGroup ↔ OfficeRole =====
            modelBuilder.Entity<OfficeGroup>()
                .HasMany(g => g.OfficeRole)
                .WithMany()
                .UsingEntity<Dictionary<string, object>>(
                    "OfficeGroupOfficeRole",
                    j => j
                        .HasOne<OfficeRole>()
                        .WithMany()
                        .HasForeignKey("OfficeRoleId")
                        .HasPrincipalKey(r => r.ID),
                    j => j
                        .HasOne<OfficeGroup>()
                        .WithMany()
                        .HasForeignKey("OfficeGroupId")
                        .HasPrincipalKey(g => g.ID),
                    j =>
                    {
                        j.ToTable("OfficeGroupOfficeRole");
                        j.HasKey("OfficeGroupId", "OfficeRoleId");
                    });

            base.OnModelCreating(modelBuilder);
        }
        public DbSet<DbContexts.RKNETDB.Models.OfficeUser> OfficeUser { get; set; } //пользователь
        public DbSet<DbContexts.RKNETDB.Models.FactoryNXBuffer> FactoryNXBuffer { get; set; } //Логи NX Завод
        public DbSet<DbContexts.RKNETDB.Models.FactoryPerson> FactoryPerson { get; set; } //Сотрудники Завод
        public DbSet<DbContexts.RKNETDB.Models.Personality> Personalities { get; set; } //Сотрудники Завод
        public DbSet<DbContexts.RKNETDB.Models.OfficeRole> OfficeRole { get; set; }
        public DbSet<DbContexts.RKNETDB.Models.OfficeGroup> OfficeGroup { get; set; }
        public DbSet<DbContexts.RKNETDB.Models.Location> Locations { get; set; } // локация

    }
}
