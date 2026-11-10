namespace Office.Server.Calculator;

/// <summary>Точка в новом расчёте: включён ли он, сколько противней в печи и как точка реагирует на дождь.</summary>
public sealed record PlanningStore(int TTCode, bool Forecast, int? OvenTrays, double? RainEffect);

/// <summary>
/// Настройки нового расчёта для категории: вероятность, что товара хватит до следующей партии,
/// умножать ли на коэффициенты K1–K3, время до витрины по умолчанию, сдвиг набора покупок в жару и мороз.
/// </summary>
public sealed record PlanningCategory(string Category, double Availability, bool UseCoefficients, int LeadMinutes, double HeatEffect, double ColdEffect);

/// <summary>Позиция: через сколько минут после захода партия на витрине и данные для раскладки по противням.</summary>
public sealed record PlanningItem(int RkCode, int? LeadMinutes, int? TrayCapacity, string? Program);

/// <summary>
/// Модификатор спроса на даты (включительно): праздник, мероприятие, акция, закрытый подход к точке.
/// Пустые точка, категория и позиция — для всех. Factor 0,82 — на 18% меньше обычного.
/// </summary>
public sealed record PlanningModifier(int Id, string Kind, string Title, DateTime DateFrom, DateTime DateTo, int? TTCode, string? Category, int? RkCode, double Factor);

/// <summary>Срочный заход вне окна: категория внезапно закончилась.</summary>
public sealed record UrgentVisit(int Id, int TTCode, string Category, DateTime StartedAt, string Reason, int UserId, string UserName);

/// <summary>
/// Настройки нового расчёта и срочные заходы — пока в памяти сервера, чтобы проверить функционал без новых таблиц.
/// При перезапуске бэкенда всё возвращается к значениям по умолчанию и праздникам по закону.
/// </summary>
public sealed class CalculatorPlanningStore
{
    /// <summary>Значения по умолчанию: время до витрины и сдвиг набора покупок в жару и мороз — по продажам 2025–2026.</summary>
    public static readonly IReadOnlyDictionary<string, PlanningCategory> CategoryDefaults = new Dictionary<string, PlanningCategory>
    {
        ["bread"] = new("bread", 0.8, false, 45, -0.01, -0.04),
        ["bakery"] = new("bakery", 0.8, false, 60, -0.02, 0.01),
        ["confectionery"] = new("confectionery", 0.75, false, 180, -0.09, -0.08),
        ["sandwiches"] = new("sandwiches", 0.8, false, 90, 0.04, 0),
        ["other"] = new("other", 0.75, false, 60, -0.01, -0.03),
    };

    /// <summary>
    /// Праздники, закреплённые законом (ТК РФ, ст. 112), с множителями по продажам 2025–2026:
    /// новогодние −29%, остальные −18%, майские −13% к тому же дню недели. Переносы выходных аудитор добавляет сам.
    /// </summary>
    public static IReadOnlyList<PlanningModifier> Holidays()
    {
        static PlanningModifier H(string title, DateTime from, DateTime to, double factor) => new(0, "holiday", title, from, to, null, null, null, factor);
        var list = new List<PlanningModifier> { H("День народного единства", new(2026, 11, 4), new(2026, 11, 4), 0.82) };
        foreach (var year in new[] { 2027, 2028 })
        {
            list.Add(H("Новогодние каникулы", new(year, 1, 1), new(year, 1, 8), 0.71));
            list.Add(H("День защитника Отечества", new(year, 2, 23), new(year, 2, 23), 0.82));
            list.Add(H("Международный женский день", new(year, 3, 8), new(year, 3, 8), 0.82));
            list.Add(H("Праздник Весны и Труда", new(year, 5, 1), new(year, 5, 1), 0.87));
            list.Add(H("День Победы", new(year, 5, 9), new(year, 5, 9), 0.87));
            list.Add(H("День России", new(year, 6, 12), new(year, 6, 12), 0.82));
            list.Add(H("День народного единства", new(year, 11, 4), new(year, 11, 4), 0.82));
        }
        return list;
    }

    private readonly object sync = new();
    private readonly Dictionary<int, PlanningStore> stores = [];
    private readonly Dictionary<string, PlanningCategory> categories = new(CategoryDefaults);
    private readonly Dictionary<int, PlanningItem> items = [];
    private readonly Dictionary<string, double> settings = new(ForecastSettings.Defaults);
    private readonly List<PlanningModifier> modifiers;
    private readonly List<UrgentVisit> urgent = [];
    private int lastModifierId;
    private int lastUrgentId;

    public CalculatorPlanningStore()
    {
        modifiers = Holidays().Select((x, i) => x with { Id = i + 1 }).ToList();
        lastModifierId = modifiers.Count;
    }

    public ForecastSettings Settings()
    {
        lock (sync)
            return ForecastSettings.From(settings);
    }

    public void SaveSettings(IReadOnlyDictionary<string, double> values)
    {
        lock (sync)
            foreach (var (key, value) in values)
                settings[key] = value;
    }

    public PlanningCategory Category(string slug)
    {
        lock (sync)
            return categories.GetValueOrDefault(slug) ?? CategoryDefaults[slug];
    }

    public void SaveCategory(PlanningCategory category)
    {
        lock (sync)
            categories[category.Category] = category;
    }

    public PlanningStore? Store(int tt)
    {
        lock (sync)
            return stores.GetValueOrDefault(tt);
    }

    public IReadOnlyDictionary<int, PlanningStore> Stores()
    {
        lock (sync)
            return new Dictionary<int, PlanningStore>(stores);
    }

    public void SaveStore(PlanningStore store)
    {
        lock (sync)
            stores[store.TTCode] = store;
    }

    public IReadOnlyDictionary<int, PlanningItem> Items()
    {
        lock (sync)
            return new Dictionary<int, PlanningItem>(items);
    }

    public void SaveItem(PlanningItem item)
    {
        lock (sync)
            items[item.RkCode] = item;
    }

    public IReadOnlyList<PlanningModifier> Modifiers()
    {
        lock (sync)
            return [.. modifiers];
    }

    /// <summary>Id 0 — новая запись; иначе замена существующей. null — такой записи нет.</summary>
    public PlanningModifier? SaveModifier(PlanningModifier modifier)
    {
        lock (sync)
        {
            if (modifier.Id == 0)
            {
                var created = modifier with { Id = ++lastModifierId };
                modifiers.Add(created);
                return created;
            }
            var index = modifiers.FindIndex(x => x.Id == modifier.Id);
            if (index < 0)
                return null;
            modifiers[index] = modifier;
            return modifier;
        }
    }

    public bool DeleteModifier(int id)
    {
        lock (sync)
            return modifiers.RemoveAll(x => x.Id == id) > 0;
    }

    public IReadOnlyList<UrgentVisit> Urgent()
    {
        lock (sync)
            return [.. urgent];
    }

    /// <summary>Действующий срочный заход категории, если он есть; иначе новый. Проверка и запись — одним шагом.</summary>
    public UrgentVisit StartUrgent(int tt, string category, DateTime now, string reason, int userId, string userName, int minutes)
    {
        lock (sync)
        {
            var since = now.AddMinutes(-minutes);
            var active = urgent.LastOrDefault(x => x.TTCode == tt && x.Category == category && x.StartedAt > since && x.StartedAt <= now);
            if (active is not null)
                return active;
            var visit = new UrgentVisit(++lastUrgentId, tt, category, now, reason, userId, userName);
            urgent.Add(visit);
            return visit;
        }
    }
}
