namespace Office.Server.Reports;

public static class ReportRoles
{
    public const string Profit = "ReportsProfit";
    public const string ProfitPro = "ReportsProfitPro";
    public const string ServiceDesk = "ReportsServiceDesk";
    public const string ChecksTime = "ReportsChecksTime";
    public const string Franchisee = "ReportsFranchisee";
    public const string Other = "ReportsOther";
    public const string OneC = "Reports1C";

    /// <summary>Настройка ссылок на отчёты, персональных ссылок и папки «Других отчётов».</summary>
    public const string Admin = "ReportsAdmin";

    public const string Any = Profit + "," + ProfitPro + "," + ServiceDesk + "," + ChecksTime + ","
        + Franchisee + "," + Other + "," + OneC + "," + Admin;

    public static readonly IReadOnlyList<(string Code, string Name, string Description)> Definitions =
    [
        (Profit, "Отчёты - Выручка", "Отчёт Power BI по выручке"),
        (ProfitPro, "Отчёты - Выручка Pro", "Расширенный отчёт Power BI по выручке"),
        (ServiceDesk, "Отчёты - Сервис-деск", "Отчёт Power BI по сервис-деску"),
        (ChecksTime, "Отчёты - Время чеков", "Отчёт Power BI «Время чеков»"),
        (Franchisee, "Отчёты - Франчайзи", "Выгрузки продаж, списаний, отгрузок и прайсов по своим точкам"),
        (Other, "Отчёты - Другие отчёты", "Файлы отчётов из сетевой папки"),
        (OneC, "Отчёты - 1С", "Ссылка на веб-клиент отчётов 1С"),
        (Admin, "Отчёты - Администратор", "Настройка ссылок на отчёты и папки «Других отчётов»"),
    ];
}
