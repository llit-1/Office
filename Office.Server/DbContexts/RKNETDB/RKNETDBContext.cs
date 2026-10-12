using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.DbContexts.RKNETDB
{
    public class RKNETDBContext : DbContext
    {
        public RKNETDBContext(DbContextOptions<RKNETDBContext> options) : base(options) { }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            // Locations has active INSERT/UPDATE triggers. SQL Server rejects
            // EF's direct OUTPUT clause for this table; keep trigger-compatible SQL.
            modelBuilder.Entity<Location>()
                .ToTable("Locations", table => table.UseSqlOutputClause(false));

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

            modelBuilder.Entity<FactorySKUDGroupReader>()
                .HasKey(e => new { e.GroupId, e.ReaderId });

            // FactoryPerson has DB triggers; disable OUTPUT clause to avoid SQL error 334.
            modelBuilder.Entity<FactoryPerson>()
                .ToTable("FactoryPerson", tb => tb.UseSqlOutputClause(false));

            modelBuilder.Entity<OfficeAuthLog>()
                .HasOne(x => x.OfficeUser)
                .WithMany()
                .HasForeignKey(x => x.OfficeUserId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<OfficeKnowledgeSectionRole>()
                .HasKey(x => new { x.SectionId, x.OfficeRoleId });
            modelBuilder.Entity<OfficeKnowledgeSectionRole>()
                .HasOne(x => x.Section)
                .WithMany(x => x.Roles)
                .HasForeignKey(x => x.SectionId)
                .OnDelete(DeleteBehavior.Cascade);
            modelBuilder.Entity<OfficeKnowledgeSectionRole>()
                .HasOne(x => x.OfficeRole)
                .WithMany()
                .HasForeignKey(x => x.OfficeRoleId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<OfficeKnowledgeSectionCover>()
                .HasOne(x => x.Section)
                .WithOne(x => x.Cover)
                .HasForeignKey<OfficeKnowledgeSectionCover>(x => x.SectionId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<OfficeKnowledgeDocument>()
                .HasIndex(x => x.SectionId);
            modelBuilder.Entity<OfficeKnowledgeDocument>()
                .HasOne(x => x.Section)
                .WithMany(x => x.Documents)
                .HasForeignKey(x => x.SectionId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<OfficeKnowledgeFavorite>()
                .HasKey(x => new { x.OfficeUserId, x.DocumentId });
            modelBuilder.Entity<OfficeKnowledgeFavorite>()
                .HasOne(x => x.OfficeUser)
                .WithMany()
                .HasForeignKey(x => x.OfficeUserId)
                .OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<OfficeKnowledgeFavorite>()
                .HasOne(x => x.Document)
                .WithMany()
                .HasForeignKey(x => x.DocumentId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<OfficeKnowledgeHistory>()
                .HasOne(x => x.OfficeUser)
                .WithMany()
                .HasForeignKey(x => x.OfficeUserId)
                .OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<OfficeKnowledgeHistory>()
                .HasOne(x => x.Document)
                .WithMany()
                .HasForeignKey(x => x.DocumentId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<OfficeKnowledgeIndexError>()
                .HasOne(x => x.Section)
                .WithMany()
                .HasForeignKey(x => x.SectionId)
                .OnDelete(DeleteBehavior.Cascade);

            // ===== OfficeOrder* =====
            // В БД внешние ключи заказов без каскада (ON DELETE NO ACTION).
            modelBuilder.Entity<OfficeOrderLocationRule>()
                .HasKey(x => new { x.LocationGuid, x.RuleId });
            modelBuilder.Entity<OfficeOrderLocationRule>()
                .HasOne(x => x.Location)
                .WithMany()
                .HasForeignKey(x => x.LocationGuid)
                .OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<OfficeOrderLocationRule>()
                .HasOne(x => x.Rule)
                .WithMany(x => x.LocationRules)
                .HasForeignKey(x => x.RuleId)
                .OnDelete(DeleteBehavior.NoAction);

            modelBuilder.Entity<OfficeOrderItem>()
                .HasOne(x => x.Group)
                .WithMany(x => x.Items)
                .HasForeignKey(x => x.GroupId)
                .OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<OfficeOrderItem>()
                .HasOne(x => x.Rule)
                .WithMany(x => x.Items)
                .HasForeignKey(x => x.RuleId)
                .OnDelete(DeleteBehavior.NoAction);

            modelBuilder.Entity<OfficeOrder>()
                .HasOne(x => x.Location)
                .WithMany()
                .HasForeignKey(x => x.LocationGuid)
                .OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<OfficeOrder>()
                .HasOne(x => x.OfficeUser)
                .WithMany()
                .HasForeignKey(x => x.OfficeUserId)
                .OnDelete(DeleteBehavior.NoAction);
            modelBuilder.Entity<OfficeOrder>()
                .HasOne(x => x.Rule)
                .WithMany()
                .HasForeignKey(x => x.RuleId)
                .OnDelete(DeleteBehavior.NoAction);

            // ===== OfficeOrder ↔ OfficeOrderItem =====
            modelBuilder.Entity<OfficeOrder>()
                .HasMany(o => o.Items)
                .WithMany()
                .UsingEntity<Dictionary<string, object>>(
                    "OfficeOrderLines",
                    j => j
                        .HasOne<OfficeOrderItem>()
                        .WithMany()
                        .HasForeignKey("Item")
                        .HasPrincipalKey(i => i.Id),
                    j => j
                        .HasOne<OfficeOrder>()
                        .WithMany()
                        .HasForeignKey("Order")
                        .HasPrincipalKey(o => o.Id),
                    j =>
                    {
                        j.ToTable("OfficeOrderLines");
                        j.HasKey("Order", "Item");
                    });

            base.OnModelCreating(modelBuilder);
        }
        public DbSet<DbContexts.RKNETDB.Models.OfficeUser> OfficeUser { get; set; }//пользователь
        public DbSet<DbContexts.RKNETDB.Models.FactoryNXBuffer> FactoryNXBuffer { get; set; } //Логи NX Завод
        public DbSet<DbContexts.RKNETDB.Models.FactoryPerson> FactoryPerson { get; set; } //Сотрудники Завод
        public DbSet<DbContexts.RKNETDB.Models.Personality> Personalities { get; set; } //Сотрудники Завод
        public DbSet<DbContexts.RKNETDB.Models.OfficeRole> OfficeRole { get; set; }
        public DbSet<DbContexts.RKNETDB.Models.OfficeGroup> OfficeGroup { get; set; }
        public DbSet<DbContexts.RKNETDB.Models.Location> Locations { get; set; } // локация
        public DbSet<DbContexts.RKNETDB.Models.LocationType> LocationTypes { get; set; } // типы локаций
        public DbSet<DbContexts.RKNETDB.Models.LocationVersion> LocationVersions { get; set; } // версии локаций
        public DbSet<DbContexts.RKNETDB.Models.Entity> Entity { get; set; } // организации
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
        public DbSet<FactorySKUDGroupReader> FactorySKUDGroupReader { get; set; }
        public DbSet<FactorySKUDController> FactorySKUDController { get; set; }
        public DbSet<FactorySKUDReader> FactorySKUDReader { get; set; }
        public DbSet<WarehouseCategories> WarehouseCategories { get; set; }
        public DbSet<WarehouseHolder> WarehouseHolders { get; set; }
        public DbSet<OfficeBid> OfficeBids { get; set; }
        public DbSet<OfficeAuthLog> OfficeAuthLogs { get; set; }
        public DbSet<VideoDevice> VideoDevices { get; set; }
        public DbSet<VideoInfo> VideoInfo { get; set; }
        public DbSet<VideoOrientation> VideoOrientation { get; set; }
        public DbSet<OfficeKnowledgeSection> OfficeKnowledgeSections { get; set; }
        public DbSet<OfficeKnowledgeSectionCover> OfficeKnowledgeSectionCovers { get; set; }
        public DbSet<OfficeKnowledgeSectionRole> OfficeKnowledgeSectionRoles { get; set; }
        public DbSet<OfficeKnowledgeDocument> OfficeKnowledgeDocuments { get; set; }
        public DbSet<OfficeKnowledgeFavorite> OfficeKnowledgeFavorites { get; set; }
        public DbSet<OfficeKnowledgeHistory> OfficeKnowledgeHistory { get; set; }
        public DbSet<OfficeKnowledgeIndexError> OfficeKnowledgeIndexErrors { get; set; }
        public DbSet<OfficeReportSetting> OfficeReportSettings { get; set; } // ссылки раздела «Отчёты»
        public DbSet<SaleObject> SaleObjects { get; set; } // позиции чеков R-Keeper
        public DbSet<SaleObjectAgregator> SaleObjectsAgregators { get; set; } // позиции заказов агрегаторов
        public DbSet<CurrencyType> CurrencyTypes { get; set; } // типы валют R-Keeper
        public DbSet<LastUser> LastUsers { get; set; } // последний пользователь отчёта «Выручка»
        public DbSet<OfficeOrder> OfficeOrders { get; set; } // заказы ТТ
        public DbSet<OfficeOrderItem> OfficeOrderItems { get; set; } // номенклатура заказов
        public DbSet<OfficeOrderGroup> OfficeOrderGroups { get; set; } // группы номенклатуры
        public DbSet<OfficeOrderRule> OfficeOrderRules { get; set; } // правила приёма и отгрузки
        public DbSet<OfficeOrderLocationRule> OfficeOrderLocationRules { get; set; } // сдвиг отгрузки по локациям
    }
}
