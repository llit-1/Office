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

            // Composite keys for factory join tables
            modelBuilder.Entity<FactoryDepartmentFactoryWorkshop>()
                .HasKey(e => new { e.FactoryDepartmentId, e.FactoryWorkshopId });

            modelBuilder.Entity<FactoryJobTitleFactoryWorkshop>()
                .HasKey(e => new { e.FactoryJobTitleId, e.FactoryWorkshopId });

            modelBuilder.Entity<FactoryDepartmentWorkshopJobTitle>()
                .HasKey(e => new { e.FactoryDepartmentId, e.FactoryWorkshopId, e.FactoryJobTitleId });

            // Map FactoryDepartmentWorkshopJobTitle navigations to existing composite join entities
            modelBuilder.Entity<FactoryDepartmentWorkshopJobTitle>()
                .HasOne(e => e.JobTitleWorkshop)
                .WithMany(j => j.DepartmentWorkshopJobTitles)
                .HasForeignKey(e => new { e.FactoryJobTitleId, e.FactoryWorkshopId })
                .HasPrincipalKey(j => new { j.FactoryJobTitleId, j.FactoryWorkshopId });

            modelBuilder.Entity<FactoryDepartmentWorkshopJobTitle>()
                .HasOne(e => e.DepartmentWorkshop)
                .WithMany(d => d.DepartmentWorkshopJobTitles)
                .HasForeignKey(e => new { e.FactoryDepartmentId, e.FactoryWorkshopId })
                .HasPrincipalKey(d => new { d.FactoryDepartmentId, d.FactoryWorkshopId });

            // FactoryPerson has DB triggers; disable OUTPUT clause to avoid SQL error 334.
            modelBuilder.Entity<FactoryPerson>()
                .ToTable("FactoryPerson", tb => tb.UseSqlOutputClause(false));

            base.OnModelCreating(modelBuilder);
        }
        public DbSet<DbContexts.RKNETDB.Models.OfficeUser> OfficeUser { get; set; }//пользователь
        public DbSet<DbContexts.RKNETDB.Models.FactoryNXBuffer> FactoryNXBuffer { get; set; } //Логи NX Завод
        public DbSet<DbContexts.RKNETDB.Models.FactoryPerson> FactoryPerson { get; set; } //Сотрудники Завод
        public DbSet<DbContexts.RKNETDB.Models.Personality> Personalities { get; set; } //Сотрудники Завод
        public DbSet<DbContexts.RKNETDB.Models.OfficeRole> OfficeRole { get; set; }
        public DbSet<DbContexts.RKNETDB.Models.OfficeGroup> OfficeGroup { get; set; }
        public DbSet<DbContexts.RKNETDB.Models.Location> Locations { get; set; } // локация
        public DbSet<DbContexts.RKNETDB.Models.JobTitle> JobTitles { get; set; }
        public DbSet<DbContexts.RKNETDB.Models.PersonalityVersion> PersonalityVersions { get; set; }
        public DbSet<DbContexts.RKNETDB.Models.TimeSheet> TimeSheets { get; set; }
        public DbSet<DbContexts.RKNETDB.Models.OfficeNotification> OfficeNotifications { get; set; }
        public DbSet<DbContexts.RKNETDB.Models.OfficeNotificationType> OfficeNotificationTypes { get; set; }


        // Factory-related DbSets added for PersonalityFactoryController
        public DbSet<FactoryBank> FactoryBank { get; set; }
        public DbSet<FactoryBanks> FactoryBanks { get; set; }
        public DbSet<FactoryCitizenship> FactoryCitizenship { get; set; }
        public DbSet<FactoryCitizenshipType> FactoryCitizenshipType { get; set; }
        public DbSet<FactoryDocument> FactoryDocument { get; set; }
        public DbSet<FactoryDocumentType> FactoryDocumentType { get; set; }
        public DbSet<FactoryEntity> FactoryEntity { get; set; }
        public DbSet<FactoryDepartment> FactoryDepartment { get; set; }
        public DbSet<FactoryDepartmentFactoryWorkshop> FactoryDepartmentFactoryWorkshop { get; set; }
        public DbSet<FactoryDepartmentWorkshopJobTitle> FactoryDepartmentWorkshopJobTitle { get; set; }
        public DbSet<FactoryJobTitle> FactoryJobTitle { get; set; }
        public DbSet<FactoryJobTitleFactoryWorkshop> FactoryJobTitleFactoryWorkshop { get; set; }
        public DbSet<FactorySKUDWorkLog> FactorySKUDWorkLog { get; set; }
        public DbSet<FactoryWorkshop> FactoryWorkshop { get; set; }
        public DbSet<FactorySKUDGroup> FactorySKUDGroup { get; set; }
        public DbSet<WarehouseCategories> WarehouseCategories { get; set; }
        public DbSet<WarehouseHolder> WarehouseHolders { get; set; }
        public DbSet<OfficeBid> OfficeBids { get; set; }
    }
}
