using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Office.Server.DbContexts.Calculator;

/// <summary>Категория калькулятора: хлеб, выпечка, кондитерка, сэндвичи, прочее.</summary>
[Table("ItemsGroups")]
public class CalcItemsGroup
{
    [Key, Column("GUID")] public Guid Guid { get; set; }
    [Column("NAME")] public string Name { get; set; } = "";
    /// <summary>Сколько часов готовится новая партия: продажи этих часов текущий остаток уже не покроет.</summary>
    [Column("HOURFORPRODUCTION")] public int HourForProduction { get; set; }
}

/// <summary>Позиция калькулятора.</summary>
[Table("Items")]
public class CalcItem
{
    [Key, Column("RKCODE"), DatabaseGenerated(DatabaseGeneratedOption.None)] public int RkCode { get; set; }
    [Column("NAME")] public string Name { get; set; } = "";
    [Column("ITEMSGROUP")] public Guid ItemsGroup { get; set; }
    [Column("COEFFICIENT")] public double Coefficient { get; set; }
    [Column("SEQUENCE")] public int? Sequence { get; set; }
    /// <summary>Минуты дефроста строкой («40»), может быть пустой.</summary>
    public string? DefrostTime { get; set; }
    /// <summary>Режим печи («P1», «P3»…), может быть пустым.</summary>
    public string? BakingMode { get; set; }
    public int? MinShowCase { get; set; }
    /// <summary>Сколько сэндвичей выходит из одной булки.</summary>
    public int? SandwichOnBuns { get; set; }
    [Column("ReplacementGroups")] public int? ReplacementGroupId { get; set; }
    public int? Actual { get; set; }
}

/// <summary>Позиция на конкретной точке со своим коэффициентом.</summary>
[Table("ItemOnTT")]
public class CalcItemOnTT
{
    [Key, Column("GUID")] public Guid Guid { get; set; }
    [Column("NAME")] public string Name { get; set; } = "";
    [Column("TTCODE")] public int TTCode { get; set; }
    [Column("ITEMRKCODE")] public int ItemRkCode { get; set; }
    [Column("COEFFICIENT")] public double Coefficient { get; set; }
}

/// <summary>Период дня категории (часы включительно).</summary>
[Table("TimeGroups")]
public class CalcTimeGroup
{
    [Key, Column("GUID")] public Guid Guid { get; set; }
    [Column("NAME")] public string Name { get; set; } = "";
    [Column("FIRSTHOUR")] public int FirstHour { get; set; }
    [Column("LASTHOUR")] public int LastHour { get; set; }
    [Column("ITEMSGROUP")] public Guid ItemsGroup { get; set; }
}

/// <summary>Группа дней недели. *US — номера дней как DayOfWeek (воскресенье = 0).</summary>
[Table("DayGroups")]
public class CalcDayGroup
{
    [Key, Column("GUID")] public Guid Guid { get; set; }
    [Column("NAME")] public string Name { get; set; } = "";
    [Column("FIRSTDAY")] public int FirstDay { get; set; }
    [Column("LASTDAY")] public int LastDay { get; set; }
    [Column("FIRSTDAYUS")] public int FirstDayUS { get; set; }
    [Column("LASTDAYUS")] public int LastDayUS { get; set; }
}

/// <summary>Пара «группа дней × период» — по ней хранятся продажи.</summary>
[Table("TimeDayGroups")]
public class CalcTimeDayGroup
{
    [Key, Column("GUID")] public Guid Guid { get; set; }
    [Column("NAME")] public string Name { get; set; } = "";
    [Column("TIMEGROUPGUID")] public Guid TimeGroupGuid { get; set; }
    [Column("DAYGROUPGUID")] public Guid DayGroupGuid { get; set; }
}

/// <summary>На сколько периодов вперёд считаем в это время суток (0 — сейчас не считаем).</summary>
[Table("CalculatorReaction")]
public class CalcReaction
{
    [Key, Column("GUID")] public Guid Guid { get; set; }
    [Column("ITEMSGROUP")] public Guid ItemsGroup { get; set; }
    [Column("FIRSTHOUR")] public int FirstHour { get; set; }
    [Column("LASTHOUR")] public int LastHour { get; set; }
    [Column("REACTION")] public int Reaction { get; set; }
}

/// <summary>Коэффициент точки на период.</summary>
[Table("ItemsGroupTimeTT_COEFFICIENT")]
public class CalcPeriodCoefficient
{
    [Column("TIMEGROUPGUID")] public Guid TimeGroupGuid { get; set; }
    [Column("TTCODE")] public int TTCode { get; set; }
    [Column("COEFFICIENT")] public double Coefficient { get; set; }
    /// <summary>«Невский 96 Утро(Выпечные изделия)» — для людей, расчёт его не читает.</summary>
    [Column("NAME")] public string? Name { get; set; }
}

/// <summary>Точка калькулятора.</summary>
[Table("TT")]
public class CalcTT
{
    [Key, DatabaseGenerated(DatabaseGeneratedOption.None)] public int TTCode { get; set; }
    public string TTName { get; set; } = "";
}

/// <summary>Продажи позиции на точке по часам периода, суммарно за SettlementDays похожих дней.</summary>
[Table("NumberOfSales")]
public class CalcSales
{
    public Guid ItemOnTTGUID { get; set; }
    public Guid TimeDayGroupsGUID { get; set; }
    public int Hour { get; set; }
    public int Quantity { get; set; }
    public int SettlementDays { get; set; }
}

/// <summary>Особый день, который считается как другая группа дней (праздники).</summary>
[Table("SpecialDays")]
public class CalcSpecialDay
{
    [Key, Column("ID")] public int Id { get; set; }
    public DateTime Date { get; set; }
    public Guid? DayGroupsGuid { get; set; }
}

[Table("ReplacementGroups")]
public class CalcReplacementGroup
{
    [Key, Column("ID")] public int Id { get; set; }
    public string Name { get; set; } = "";
}

/// <summary>Работа по аналогу: позицию считаем по другой позиции, точку — по другой точке.</summary>
[Table("Replacements")]
public class CalcReplacement
{
    [Key] public int Id { get; set; }
    public int? ItemCode { get; set; }
    public int? ReplacementItemCode { get; set; }
    public int? TTCode { get; set; }
    public int? ReplacementTTCode { get; set; }
    public DateTime Begin { get; set; }
    public DateTime End { get; set; }
}

/// <summary>Блокировка позиции. Type 1 — может снять точка, 2 и 3 — только аудитор.</summary>
[Table("ItemBlocks")]
public class CalcItemBlock
{
    [Key] public int Id { get; set; }
    public int ItemRkCode { get; set; }
    /// <summary>null — для всех точек.</summary>
    public int? TTCode { get; set; }
    [Column(TypeName = "date")] public DateTime Begin { get; set; }
    [Column(TypeName = "date")] public DateTime End { get; set; }
    public int Type { get; set; }
    public bool Enable { get; set; }
    public string? Info { get; set; }
}
