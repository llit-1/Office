using Microsoft.EntityFrameworkCore;

namespace Office.Server.DbContexts.Calculator;

/// <summary>База CALCULATOR старого калькулятора розницы: справочники, продажи по периодам, блокировки.</summary>
public class CalculatorDbContext(DbContextOptions<CalculatorDbContext> options) : DbContext(options)
{
    /// <summary>CALCULATOR лежит на том же сервере и под той же учёткой, что RKNET, — меняем только базу.</summary>
    public static string ConnectionStringFrom(string rknetConnectionString) =>
        new Microsoft.Data.SqlClient.SqlConnectionStringBuilder(rknetConnectionString) { InitialCatalog = "CALCULATOR" }.ConnectionString;

    public DbSet<CalcItemsGroup> ItemsGroups => Set<CalcItemsGroup>();
    public DbSet<CalcItem> Items => Set<CalcItem>();
    public DbSet<CalcItemOnTT> ItemOnTT => Set<CalcItemOnTT>();
    public DbSet<CalcTimeGroup> TimeGroups => Set<CalcTimeGroup>();
    public DbSet<CalcDayGroup> DayGroups => Set<CalcDayGroup>();
    public DbSet<CalcTimeDayGroup> TimeDayGroups => Set<CalcTimeDayGroup>();
    public DbSet<CalcReaction> Reactions => Set<CalcReaction>();
    public DbSet<CalcPeriodCoefficient> PeriodCoefficients => Set<CalcPeriodCoefficient>();
    public DbSet<CalcSales> Sales => Set<CalcSales>();
    public DbSet<CalcSpecialDay> SpecialDays => Set<CalcSpecialDay>();
    public DbSet<CalcReplacementGroup> ReplacementGroups => Set<CalcReplacementGroup>();
    public DbSet<CalcReplacement> Replacements => Set<CalcReplacement>();
    public DbSet<CalcItemBlock> ItemBlocks => Set<CalcItemBlock>();
    public DbSet<CalcTT> TTs => Set<CalcTT>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.Entity<CalcPeriodCoefficient>().HasKey(x => new { x.TimeGroupGuid, x.TTCode });
        // строки продаж уникального ключа не имеют, читаем их только без отслеживания
        modelBuilder.Entity<CalcSales>().HasKey(x => new { x.ItemOnTTGUID, x.TimeDayGroupsGUID, x.Hour });
    }
}
