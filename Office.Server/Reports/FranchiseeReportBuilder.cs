using System.Globalization;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.Reports1C;
using Office.Server.DbContexts.RK7;
using Office.Server.DbContexts.RKNETDB;

namespace Office.Server.Reports;

public static partial class ReportConnections
{
    public static string Rk7(IConfiguration configuration)
    {
        var configured = configuration.GetConnectionString("RK7");
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return configured;
        }

        // Старый портал читал RK7new на том же сервере и под той же учётной записью, что и RKNET.
        return new SqlConnectionStringBuilder(Global.MSSqlConnectionString) { InitialCatalog = "RK7new" }.ConnectionString;
    }

    public static string? Reports1C(IConfiguration configuration)
    {
        var configured = configuration.GetConnectionString("Reports1C");
        return string.IsNullOrWhiteSpace(configured) ? null : WithLegacyTls(configured);
    }

    /// <summary>
    /// Строка 1С перенесена из старого портала на EF Core 5, где SqlClient не шифровал соединение по умолчанию.
    /// Microsoft.Data.SqlClient 5 шифрует и проверяет сертификат сервера: с недоверенным сертификатом
    /// подключение падает на TLS, и все отчёты 1С отвечают общей ошибкой. Явно заданное значение не трогаем.
    /// </summary>
    internal static string WithLegacyTls(string connectionString)
    {
        if (TrustServerCertificateKey().IsMatch(connectionString)) return connectionString;
        return new SqlConnectionStringBuilder(connectionString) { TrustServerCertificate = true }.ConnectionString;
    }

    [System.Text.RegularExpressions.GeneratedRegex(@"trust\s*server\s*certificate\s*=", System.Text.RegularExpressions.RegexOptions.IgnoreCase)]
    private static partial System.Text.RegularExpressions.Regex TrustServerCertificateKey();
}

public sealed record FranchiseeReportData(IReadOnlyList<ReportColumnDto> Columns, List<Dictionary<string, object?>> Rows);

/// <summary>Отчёты франчайзи по данным R-Keeper и 1С. Запросы и фильтры повторяют старый портал.</summary>
public sealed class FranchiseeReportBuilder(
    RKNETDBContext rknet,
    Rk7Context rk7,
    Reports1CContext reports1C,
    IConfiguration configuration)
{
    public const int MaxPeriodDays = 40;
    private const int InventoryCurrency = 1000721;
    private static readonly HashSet<int> ReturnCurrencies = [1003299, 1000716];

    public static readonly IReadOnlyList<FranchiseeReportDefinitionDto> Definitions =
    [
        new("sales", "Продажи", "Проданные позиции с суммой и валютой оплаты.", UsesPeriod: true, Uses1C: false),
        new("write-offs", "Списания", "Списанные позиции с типом списания.", UsesPeriod: true, Uses1C: false),
        new("returns", "Возвраты", "Возвращённые позиции.", UsesPeriod: true, Uses1C: false),
        new("aggregators", "Агрегаторы доставки", "Продажи через агрегаторы с номером заказа.", UsesPeriod: true, Uses1C: false),
        new("inventory", "Инвентаризация", "Позиции, проведённые через инвентаризацию.", UsesPeriod: true, Uses1C: false),
        new("defects", "Акты брака", "Брак по данным 1С.", UsesPeriod: true, Uses1C: true),
        new("shipment", "Отгрузка", "Отгрузки и вычерки по данным 1С.", UsesPeriod: true, Uses1C: true),
        new("prices", "Прайсы", "Последние цены отгрузок за 30 дней по данным 1С.", UsesPeriod: false, Uses1C: true),
    ];

    public static FranchiseeReportDefinitionDto? Find(string? code) =>
        Definitions.FirstOrDefault(report => string.Equals(report.Code, code, StringComparison.OrdinalIgnoreCase));

    public bool Is1CConfigured => ReportConnections.Reports1C(configuration) is not null;

    public Task<FranchiseeReportData> BuildAsync(
        FranchiseeReportDefinitionDto report,
        int restaurant,
        int? obd,
        DateTime from,
        DateTime toExclusive,
        DateTime now,
        CancellationToken cancellationToken) => report.Code switch
        {
            "aggregators" => BuildAggregatorsAsync(restaurant, from, toExclusive, cancellationToken),
            "defects" => BuildDefectsAsync(obd!.Value, from, toExclusive, cancellationToken),
            "shipment" => BuildShipmentAsync(obd!.Value, from, toExclusive, cancellationToken),
            "prices" => BuildPricesAsync(obd!.Value, now.AddDays(-30), cancellationToken),
            _ => BuildReceiptsAsync(report.Code, restaurant, from, toExclusive, cancellationToken),
        };

    private async Task<FranchiseeReportData> BuildReceiptsAsync(
        string code,
        int restaurant,
        DateTime from,
        DateTime toExclusive,
        CancellationToken cancellationToken)
    {
        var saleCurrencyTypes = (await rknet.CurrencyTypes.AsNoTracking()
            .Where(type => type.Type == 0)
            .Select(type => type.Rk7CurrencyType)
            .ToListAsync(cancellationToken)).ToHashSet();
        var currencies = await LoadCurrenciesAsync(cancellationToken);
        var saleCurrencies = currencies.Where(x => saleCurrencyTypes.Contains(x.Parent)).Select(x => x.Sifr).ToHashSet();
        var currencyNames = currencies.GroupBy(x => x.Sifr).ToDictionary(group => group.Key, group => group.First().Name);
        var menuNames = await LoadMenuNamesAsync(cancellationToken);

        // Период ограничен 40 днями и одной точкой, поэтому валюты фильтруются в памяти, как в старом портале.
        var receipts = await rknet.SaleObjects.AsNoTracking()
            .Where(x => x.Restaurant == restaurant && x.Deleted == 0 && x.Date >= from && x.Date < toExclusive)
            .Select(x => new { x.Code, x.Quantity, x.SumWithDiscount, x.Currency, x.Date })
            .ToListAsync(cancellationToken);

        bool Matches(int currency) => code switch
        {
            "sales" => saleCurrencies.Contains(currency),
            "returns" => ReturnCurrencies.Contains(currency),
            "inventory" => currency == InventoryCurrency,
            _ => !ReturnCurrencies.Contains(currency) && currency != InventoryCurrency && !saleCurrencies.Contains(currency),
        };

        var columns = code switch
        {
            "sales" => new[] { Text("product", "Товар"), Number("quantity", "Количество"), Money("sum", "Цена"), Text("currency", "Валюта"), DateTime("date", "Дата и время продажи") },
            "returns" => [Text("product", "Товар"), Number("quantity", "Количество"), Money("sum", "Цена"), DateTime("date", "Дата и время возврата")],
            "inventory" => [Text("product", "Товар"), Number("quantity", "Количество"), Money("sum", "Цена"), Text("currency", "Тип"), DateTime("date", "Дата и время")],
            _ => [Text("product", "Товар"), Number("quantity", "Количество"), Money("sum", "Цена"), Text("currency", "Тип списания"), DateTime("date", "Дата и время списания")],
        };

        var rows = receipts
            .Where(x => Matches(x.Currency))
            .OrderBy(x => x.Date)
            .Select(x => Row(
                ("product", MenuName(menuNames, x.Code)),
                ("quantity", x.Quantity),
                ("sum", x.SumWithDiscount),
                ("currency", currencyNames.GetValueOrDefault(x.Currency)),
                ("date", FormatDate(x.Date))))
            .ToList();

        return new FranchiseeReportData(columns, rows);
    }

    private async Task<FranchiseeReportData> BuildAggregatorsAsync(
        int restaurant,
        DateTime from,
        DateTime toExclusive,
        CancellationToken cancellationToken)
    {
        var currencies = await LoadCurrenciesAsync(cancellationToken);
        var currencyNames = currencies.GroupBy(x => x.Sifr).ToDictionary(group => group.Key, group => group.First().Name);
        var menuNames = await LoadMenuNamesAsync(cancellationToken);

        var orders = await rknet.SaleObjectsAgregators.AsNoTracking()
            .Where(x => x.Restaurant == restaurant && x.Deleted == 0 && x.Date >= from && x.Date < toExclusive)
            .Select(x => new { x.Code, x.Quantity, x.SumWithDiscount, x.Currency, x.OrderNumber, x.Date })
            .ToListAsync(cancellationToken);

        var rows = orders
            .OrderBy(x => x.Date)
            .Select(x => Row(
                ("product", MenuName(menuNames, x.Code)),
                ("quantity", x.Quantity),
                ("sum", x.SumWithDiscount),
                ("aggregator", currencyNames.GetValueOrDefault(x.Currency)),
                ("order", x.OrderNumber),
                ("date", FormatDate(x.Date))))
            .ToList();

        return new FranchiseeReportData(
            [Text("product", "Товар"), Number("quantity", "Количество"), Money("sum", "Цена"), Text("aggregator", "Агрегатор"), Text("order", "Номер заказа"), DateTime("date", "Дата и время продажи")],
            rows);
    }

    private async Task<FranchiseeReportData> BuildDefectsAsync(int obd, DateTime from, DateTime toExclusive, CancellationToken cancellationToken)
    {
        var defects = await reports1C.MarriagesOnTT.AsNoTracking()
            .Where(x => x.Date >= from && x.Date < toExclusive && x.CounterpartyCode == obd)
            .ToListAsync(cancellationToken);

        var rows = defects
            .OrderBy(x => x.Date)
            .Select(x => Row(
                ("product", x.Nomenclature),
                ("quantity", x.Quantity),
                ("reason", x.ReasonMarriage),
                ("weight", x.StorageUnitstatesWeight),
                ("date", FormatDate(x.Date))))
            .ToList();

        return new FranchiseeReportData(
            [Text("product", "Товар"), Number("quantity", "Количество"), Text("reason", "Причина"), Number("weight", "Масса"), DateTime("date", "Дата")],
            rows);
    }

    private async Task<FranchiseeReportData> BuildShipmentAsync(int obd, DateTime from, DateTime toExclusive, CancellationToken cancellationToken)
    {
        var consignee = (decimal)obd;
        var shipments = await reports1C.ShipmentsByGP.AsNoTracking()
            .Where(x => x.DateOfShipmentChange >= from && x.DateOfShipmentChange < toExclusive && x.ConsigneeCodeN == consignee)
            .ToListAsync(cancellationToken);
        var strikes = await reports1C.StrikeItOut.AsNoTracking()
            .Where(x => x.Date >= from && x.Date < toExclusive && x.ConsigneeCodeN == consignee)
            .ToListAsync(cancellationToken);

        // Вычерк сопоставляется с отгрузкой по дате, артикулу и складу, как в старом портале.
        var strikeIndex = strikes
            .GroupBy(x => (x.Date, x.Article, x.WarehouseRecorder))
            .ToDictionary(group => group.Key, group => group.First());

        var rows = shipments
            .OrderBy(x => x.DateOfShipmentChange)
            .Select(x =>
            {
                strikeIndex.TryGetValue((x.DateOfShipmentChange, x.Article, x.Warehouse), out var strike);
                return Row(
                    ("parent", x.Parent),
                    ("article", x.Article),
                    ("nomenclature", x.Nomenclature),
                    ("quantity", x.Quantity),
                    ("warehouse", x.Warehouse),
                    ("orderPrice", x.OrderPrice),
                    ("date", FormatDate(x.DateOfShipmentChange)),
                    ("strikeQuantity", strike?.Quantity),
                    ("strikeAmount", strike?.Amount),
                    ("strikeReason", strike?.ReasonForReturn));
            })
            .ToList();

        return new FranchiseeReportData(
            [
                Text("parent", "Группа"), Text("article", "Артикул"), Text("nomenclature", "Номенклатура"), Number("quantity", "Количество"),
                Text("warehouse", "Склад"), Money("orderPrice", "Цена заказа"), DateTime("date", "Дата отгрузки"),
                Number("strikeQuantity", "Вычерк, кол-во"), Money("strikeAmount", "Цена вычерка"), Text("strikeReason", "Причина вычерка"),
            ],
            rows);
    }

    private async Task<FranchiseeReportData> BuildPricesAsync(int obd, DateTime since, CancellationToken cancellationToken)
    {
        var consignee = (decimal)obd;
        var shipments = await reports1C.ShipmentsByGP.AsNoTracking()
            .Where(x => x.DateOfShipmentChange >= since && x.ConsigneeCodeN == consignee)
            .ToListAsync(cancellationToken);

        var rows = shipments
            .GroupBy(x => (x.Article, x.Nomenclature))
            .Select(group => group.OrderByDescending(x => x.DateOfShipmentChange).First())
            .OrderBy(x => x.Nomenclature, StringComparer.CurrentCultureIgnoreCase)
            .Select(x => Row(
                ("article", x.Article),
                ("nomenclature", x.Nomenclature),
                ("price", x.Quantity is > 0 && x.OrderPrice is not null ? Math.Round(x.OrderPrice.Value / x.Quantity.Value, 2) : null),
                ("date", FormatDate(x.DateOfShipmentChange))))
            .ToList();

        return new FranchiseeReportData(
            [Text("article", "Артикул"), Text("nomenclature", "Номенклатура"), Money("price", "Цена"), DateTime("date", "Дата последней отгрузки")],
            rows);
    }

    private async Task<List<(int Sifr, string? Name, int Parent)>> LoadCurrenciesAsync(CancellationToken cancellationToken)
    {
        var currencies = await rk7.Currencies.AsNoTracking()
            .Select(x => new { x.Sifr, x.Name, x.Parent })
            .ToListAsync(cancellationToken);
        return currencies.Select(x => (x.Sifr, x.Name, x.Parent)).ToList();
    }

    private async Task<Dictionary<int, string?>> LoadMenuNamesAsync(CancellationToken cancellationToken)
    {
        var items = await rk7.MenuItems.AsNoTracking()
            .Where(x => x.Status != 0)
            .Select(x => new { x.Code, x.Name })
            .ToListAsync(cancellationToken);
        return items.GroupBy(x => x.Code).ToDictionary(group => group.Key, group => group.First().Name);
    }

    private static string MenuName(Dictionary<int, string?> names, int code) =>
        names.TryGetValue(code, out var name) && !string.IsNullOrWhiteSpace(name) ? name : $"Позиция с кодом {code}";

    private static string? FormatDate(DateTime? value) =>
        value?.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);

    private static Dictionary<string, object?> Row(params (string Key, object? Value)[] values) =>
        values.ToDictionary(value => value.Key, value => value.Value);

    private static ReportColumnDto Text(string key, string label) => new(key, label, "text");
    private static ReportColumnDto Number(string key, string label) => new(key, label, "number");
    private static ReportColumnDto Money(string key, string label) => new(key, label, "money");
    private static ReportColumnDto DateTime(string key, string label) => new(key, label, "datetime");
}
