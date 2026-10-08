namespace Office.Server.Reports;

public enum ReportKind
{
    PowerBi,
    External,
    Files,
    Franchisee,
}

public sealed record ReportDefinition(
    string Code,
    string Title,
    string Description,
    string Role,
    ReportKind Kind,
    bool HasPersonalLinks = false,
    string? DefaultValue = null);

public static class ReportCatalog
{
    public const string Profit = "profit";
    public const string ProfitPro = "profit-pro";
    public const string ServiceDesk = "service-desk";
    public const string ChecksTime = "checks-time";
    public const string Franchisee = "franchisee";
    public const string Other = "other";
    public const string OneC = "1c";

    // Ссылки по умолчанию взяты из представлений старого портала; администратор может заменить их в настройках.
    public static readonly IReadOnlyList<ReportDefinition> All =
    [
        new(Profit, "Выручка", "Отчёт Power BI по выручке торговых точек.", ReportRoles.Profit, ReportKind.PowerBi, HasPersonalLinks: true),
        new(ProfitPro, "Выручка Pro", "Расширенный отчёт по выручке. Для просмотра нужен вход в учётную запись Microsoft.", ReportRoles.ProfitPro, ReportKind.PowerBi, HasPersonalLinks: true),
        // Старый портал подставлял во фрейм эту ссылку скриптом, ссылка из SQLite только включала показ фрейма.
        new(ServiceDesk, "Сервис-деск", "Отчёт Power BI по заявкам сервис-деска.", ReportRoles.ServiceDesk, ReportKind.PowerBi,
            DefaultValue: "https://app.powerbi.com/view?r=eyJrIjoiZmU2NmI2NzYtY2MwNy00YWQ0LTk1OGUtM2RlODdhNmMyMzBhIiwidCI6IjA2YTBkMmRkLWNjYmQtNGRhYy04ZWFkLThhMWI5M2U0ZTRlNiIsImMiOjl9"),
        new(ChecksTime, "Время чеков", "Отчёт Power BI «Время чеков».", ReportRoles.ChecksTime, ReportKind.PowerBi,
            DefaultValue: "https://app.powerbi.com/view?r=eyJrIjoiZTkxMTkzMGUtZWFmOS00OTI1LWJkOGYtMDM3YmNhYWYyOTVjIiwidCI6IjA2YTBkMmRkLWNjYmQtNGRhYy04ZWFkLThhMWI5M2U0ZTRlNiIsImMiOjl9"),
        new(Franchisee, "Отчёты франчайзи", "Продажи, списания, возвраты, отгрузки и прайсы по вашей точке с выгрузкой в Excel.", ReportRoles.Franchisee, ReportKind.Franchisee),
        new(Other, "Другие отчёты", "Файлы отчётов из сетевой папки с просмотром в портале.", ReportRoles.Other, ReportKind.Files),
        new(OneC, "Отчёты 1С", "Веб-клиент отчётов 1С. Откроется в новой вкладке.", ReportRoles.OneC, ReportKind.External,
            DefaultValue: "http://10.140.0.25:8080/WebMobileSHZ/ru_RU/"),
    ];

    public static ReportDefinition? Find(string? code) =>
        All.FirstOrDefault(report => string.Equals(report.Code, code, StringComparison.OrdinalIgnoreCase));

    public static string KindName(ReportKind kind) => kind switch
    {
        ReportKind.PowerBi => "powerBi",
        ReportKind.External => "external",
        ReportKind.Files => "files",
        _ => "franchisee",
    };
}
