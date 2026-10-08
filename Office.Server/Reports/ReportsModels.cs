namespace Office.Server.Reports;

public sealed record ReportCatalogItemDto(string Code, string Title, string Description, string Kind, bool Configured, string? Url);

public sealed record ReportCatalogDto(IReadOnlyList<ReportCatalogItemDto> Reports, bool CanManage);

public sealed record ReportLinkDto(string Code, string Title, string Url);

public sealed record ReportFileEntryDto(string Name, string Path, string Extension, long Size, DateTime ModifiedAt);

public sealed record ReportFilesDto(IReadOnlyList<ReportFileEntryDto> Entries);

public sealed class ReportFileTicketRequest
{
    public string? Path { get; set; }
}

public sealed record ReportLocationDto(Guid Guid, string Name);

public sealed record FranchiseeReportDefinitionDto(string Code, string Title, string Description, bool UsesPeriod, bool Uses1C);

public sealed record FranchiseeLookupsDto(
    IReadOnlyList<ReportLocationDto> Locations,
    IReadOnlyList<FranchiseeReportDefinitionDto> Reports,
    int MaxPeriodDays);

public sealed record ReportColumnDto(string Key, string Label, string Type);

public sealed record ReportTableDto(
    string Code,
    string Title,
    string LocationName,
    string? From,
    string? To,
    IReadOnlyList<ReportColumnDto> Columns,
    IReadOnlyList<Dictionary<string, object?>> Rows);

public sealed record ReportSettingDto(string Code, string Title, string Kind, string Value, string? DefaultValue);

public sealed record ReportSettingsDto(IReadOnlyList<ReportSettingDto> Common);

public sealed class ReportSettingUpdateRequest
{
    public string? Value { get; set; }
}
