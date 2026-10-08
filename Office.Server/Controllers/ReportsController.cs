using System.Data.Common;
using System.Globalization;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.KnowledgeLibrary;
using Office.Server.Reports;

namespace Office.Server.Controllers;

[Route("api/reports")]
[ApiController]
[Authorize(Roles = ReportRoles.Any)]
public class ReportsController(
    RKNETDBContext db,
    FranchiseeReportBuilder franchiseeReports,
    ReportFileTickets fileTickets,
    ILogger<ReportsController> logger) : ControllerBase
{
    private const string FilesNotConfigured = "Папка «Других отчётов» ещё не настроена. Обратитесь к администратору отчётов.";
    private static readonly FileExtensionContentTypeProvider ContentTypes = new();
    private static readonly TimeZoneInfo MoscowTimeZone = ResolveMoscowTimeZone();

    // ===================== Каталог и ссылки =====================

    [HttpGet("catalog")]
    public async Task<ActionResult<ReportCatalogDto>> GetCatalog(CancellationToken cancellationToken)
    {
        var reports = ReportCatalog.All.Where(report => User.IsInRole(report.Role)).ToList();
        var user = await GetCurrentUserAsync(cancellationToken);
        var settings = await LoadSettingsAsync(reports.Select(report => report.Code).ToList(), user?.Id, cancellationToken);

        var items = reports.Select(report =>
        {
            var value = report.Kind == ReportKind.Franchisee ? null : ResolveValue(report, user, settings);
            return new ReportCatalogItemDto(
                report.Code,
                report.Title,
                report.Description,
                ReportCatalog.KindName(report.Kind),
                report.Kind == ReportKind.Franchisee || value is not null,
                report.Kind == ReportKind.External ? value : null);
        }).ToList();

        return new ReportCatalogDto(items, User.IsInRole(ReportRoles.Admin));
    }

    [HttpGet("links/{code}")]
    public async Task<ActionResult<ReportLinkDto>> GetLink(string code, CancellationToken cancellationToken)
    {
        var report = ReportCatalog.Find(code);
        if (report is null || report.Kind is not (ReportKind.PowerBi or ReportKind.External))
        {
            return NotFound(new { message = "Отчёт не найден." });
        }

        if (!User.IsInRole(report.Role))
        {
            return Forbid();
        }

        var user = await GetCurrentUserAsync(cancellationToken);
        var settings = await LoadSettingsAsync([report.Code], user?.Id, cancellationToken);
        var url = ResolveValue(report, user, settings);
        if (url is null)
        {
            return NotFound(new
            {
                message = report.HasPersonalLinks && user?.DefaultLocations != 1
                    ? "Для вашей учётной записи этот отчёт ещё не настроен. Обратитесь к администратору портала."
                    : "Ссылка на отчёт ещё не настроена. Обратитесь к администратору отчётов.",
            });
        }

        if (report.Code == ReportCatalog.Profit && user is not null)
        {
            await RememberProfitViewerAsync(user, cancellationToken);
        }

        return new ReportLinkDto(report.Code, report.Title, url);
    }

    /// <summary>
    /// Пользователь с доступом ко всем точкам видит общий отчёт. Остальные — только персональный из карточки пользователя,
    /// в котором данные ограничены их точками; общий отчёт им не показывается.
    /// </summary>
    private static string? ResolveValue(ReportDefinition report, OfficeUser? user, IReadOnlyList<OfficeReportSetting> settings)
    {
        var common = ReportSettingsWriter.Clean(settings.FirstOrDefault(x => x.ReportCode == report.Code && x.OfficeUserId == null)?.Value);
        if (!report.HasPersonalLinks || user?.DefaultLocations == 1)
        {
            return common ?? report.DefaultValue;
        }

        return user is null
            ? null
            : ReportSettingsWriter.Clean(settings.FirstOrDefault(x => x.ReportCode == report.Code && x.OfficeUserId == user.Id)?.Value);
    }

    private async Task RememberProfitViewerAsync(OfficeUser user, CancellationToken cancellationToken)
    {
        // Старый портал записывал в LastUser того, кто последним открыл «Выручку». Сохраняем это поведение для отчёта Power BI.
        try
        {
            var viewer = JoinName(user.Surname, user.Name, user.Patronymic) ?? user.Login;
            var row = await db.LastUsers.FirstOrDefaultAsync(cancellationToken);
            if (row is null)
            {
                db.LastUsers.Add(new LastUser { User = viewer });
            }
            else
            {
                row.User = viewer;
            }

            await db.SaveChangesAsync(cancellationToken);
        }
        catch (Exception exception) when (exception is DbException or DbUpdateException or InvalidOperationException)
        {
            logger.LogWarning(exception, "Could not update LastUser for profit report.");
        }
    }

    // ===================== Другие отчёты =====================

    [HttpGet("files")]
    [Authorize(Roles = ReportRoles.Other)]
    public async Task<ActionResult<ReportFilesDto>> BrowseFiles(CancellationToken cancellationToken)
    {
        var root = await GetFilesRootAsync(cancellationToken);
        if (root is null)
        {
            return NotFound(new { message = FilesNotConfigured });
        }

        try
        {
            if (!Directory.Exists(root))
            {
                return NotFound(new { message = "Папка с отчётами не найдена. Проверьте путь в настройках отчётов." });
            }

            // Показываем только файлы из корня папки: вложенные папки в разделе не открываются.
            var files = new DirectoryInfo(root).EnumerateFiles()
                .Where(file => IsVisible(file) && KnowledgeLibraryFilePolicy.IsAllowedFile(file.Name))
                .Select(file => new ReportFileEntryDto(file.Name, file.Name, file.Extension.ToLowerInvariant(), file.Length, file.LastWriteTime))
                .OrderBy(entry => entry.Name, StringComparer.CurrentCultureIgnoreCase)
                .ToList();

            return new ReportFilesDto(files);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException or System.Security.SecurityException)
        {
            logger.LogWarning(exception, "Report folder {Path} is unavailable.", root);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Сетевая папка с отчётами недоступна. Попробуйте позже." });
        }
    }

    [HttpPost("files/ticket")]
    [Authorize(Roles = ReportRoles.Other)]
    public async Task<IActionResult> CreateFileTicket([FromBody] ReportFileTicketRequest request, CancellationToken cancellationToken)
    {
        if (CurrentUserId is not int userId)
        {
            return Unauthorized();
        }

        var root = await GetFilesRootAsync(cancellationToken);
        if (root is null)
        {
            return NotFound(new { message = FilesNotConfigured });
        }

        var relative = NormalizeRelativePath(request.Path);
        if (relative.Length == 0
            || relative.Contains('/')
            || !KnowledgeLibraryFilePolicy.IsAllowedFile(relative)
            || !KnowledgeLibraryFilePolicy.TryResolvePath(root, relative, out var fullPath)
            || !System.IO.File.Exists(fullPath))
        {
            return NotFound(new { message = "Файл не найден. Обновите список файлов." });
        }

        return Ok(new { ticket = fileTickets.Issue(relative, userId) });
    }

    [AllowAnonymous]
    [HttpGet("files/media/{ticket}/{fileName?}")]
    public async Task<IActionResult> GetFileContent(string ticket, string? fileName, [FromQuery] bool download, CancellationToken cancellationToken)
    {
        // Имя файла в адресе нужно только для расширения во внешних просмотрщиках; источник истины — билет.
        _ = fileName;
        if (!fileTickets.TryGet(ticket, out var fileTicket) || fileTicket is null)
        {
            return Unauthorized(new { message = "Ссылка на файл устарела. Откройте файл заново." });
        }

        if (!await UserHasRoleAsync(fileTicket.UserId, ReportRoles.Other, cancellationToken))
        {
            return NotFound();
        }

        var root = await GetFilesRootAsync(cancellationToken);
        if (root is null
            || !KnowledgeLibraryFilePolicy.TryResolvePath(root, fileTicket.RelativePath, out var fullPath)
            || !System.IO.File.Exists(fullPath))
        {
            return NotFound();
        }

        try
        {
            var stream = new FileStream(fullPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, 64 * 1024,
                FileOptions.Asynchronous | FileOptions.SequentialScan);
            var name = Path.GetFileName(fullPath);
            var contentType = ContentTypes.TryGetContentType(name, out var detected) ? detected : "application/octet-stream";
            return download
                ? File(stream, contentType, name, enableRangeProcessing: true)
                : File(stream, contentType, enableRangeProcessing: true);
        }
        catch (IOException exception)
        {
            logger.LogWarning(exception, "Report file {Path} could not be opened.", fullPath);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Файл временно недоступен." });
        }
    }

    // ===================== Отчёты франчайзи =====================

    [HttpGet("franchisee")]
    [Authorize(Roles = ReportRoles.Franchisee)]
    public async Task<ActionResult<FranchiseeLookupsDto>> GetFranchiseeLookups(CancellationToken cancellationToken)
    {
        var user = await GetCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var locations = await AccessibleLocations(user)
            .OrderBy(location => location.Name)
            .Select(location => new ReportLocationDto(location.Guid, location.Name))
            .ToListAsync(cancellationToken);

        return new FranchiseeLookupsDto(locations, FranchiseeReportBuilder.Definitions, FranchiseeReportBuilder.MaxPeriodDays);
    }

    [HttpGet("franchisee/{code}")]
    [Authorize(Roles = ReportRoles.Franchisee)]
    public async Task<ActionResult<ReportTableDto>> GetFranchiseeReport(
        string code,
        [FromQuery] Guid locationGuid,
        [FromQuery] DateOnly? from,
        [FromQuery] DateOnly? to,
        CancellationToken cancellationToken)
    {
        var report = FranchiseeReportBuilder.Find(code);
        if (report is null)
        {
            return NotFound(new { message = "Отчёт не найден." });
        }

        var user = await GetCurrentUserAsync(cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        var location = await AccessibleLocations(user).FirstOrDefaultAsync(x => x.Guid == locationGuid, cancellationToken);
        if (location?.RKCode is not int restaurant)
        {
            return NotFound(new { message = "Точка не найдена или недоступна вам." });
        }

        var start = default(DateTime);
        var endExclusive = default(DateTime);
        if (report.UsesPeriod)
        {
            if (from is null || to is null)
            {
                return BadRequest(new { message = "Укажите начало и конец периода." });
            }

            if (from > to)
            {
                return BadRequest(new { message = "Дата начала не может быть позже даты окончания." });
            }

            if (to.Value.DayNumber - from.Value.DayNumber > FranchiseeReportBuilder.MaxPeriodDays)
            {
                return BadRequest(new { message = $"Период не должен превышать {FranchiseeReportBuilder.MaxPeriodDays} дней." });
            }

            start = from.Value.ToDateTime(TimeOnly.MinValue);
            endExclusive = to.Value.AddDays(1).ToDateTime(TimeOnly.MinValue);
        }

        int? obd = null;
        if (report.Uses1C)
        {
            if (!franchiseeReports.Is1CConfigured)
            {
                return StatusCode(StatusCodes.Status503ServiceUnavailable, new
                {
                    message = "Подключение к базе отчётов 1С не настроено. Обратитесь к администратору портала.",
                });
            }

            obd = await db.LocationVersions.AsNoTracking()
                .Where(x => x.LocationGuid == location.Guid && x.Actual == 1 && x.OBD != null)
                .OrderByDescending(x => x.VersionStartDate)
                .Select(x => x.OBD)
                .FirstOrDefaultAsync(cancellationToken);
            if (obd is null)
            {
                return BadRequest(new { message = "У точки не заполнен код 1С (OBD), поэтому данные 1С получить нельзя." });
            }
        }

        try
        {
            var data = await franchiseeReports.BuildAsync(report, restaurant, obd, start, endExclusive, MoscowNow(), cancellationToken);
            return new ReportTableDto(
                report.Code,
                report.Title,
                location.Name,
                report.UsesPeriod ? from!.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null,
                report.UsesPeriod ? to!.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : null,
                data.Columns,
                data.Rows);
        }
        catch (Exception exception) when (exception is DbException or InvalidOperationException or TimeoutException)
        {
            logger.LogError(exception, "Franchisee report {Report} failed for location {Location}.", report.Code, location.Guid);
            return StatusCode(StatusCodes.Status503ServiceUnavailable, new { message = "Не удалось получить данные отчёта. Попробуйте позже." });
        }
    }

    private IQueryable<Location> AccessibleLocations(OfficeUser user)
    {
        // DefaultLocations = 1 — пользователю доступны все торговые точки.
        return user.DefaultLocations == 1
            ? db.Locations.AsNoTracking().Where(x => x.Actual == 1 && x.RKCode != null)
            : db.OfficeUser.AsNoTracking()
                .Where(x => x.Id == user.Id)
                .SelectMany(x => x.Locations)
                .Where(x => x.Actual == 1 && x.RKCode != null);
    }

    // ===================== Настройки =====================
    // Персональные ссылки «Выручки» редактируются в карточке пользователя (UserController).

    [HttpGet("settings")]
    [Authorize(Roles = ReportRoles.Admin)]
    public async Task<ActionResult<ReportSettingsDto>> GetSettings(CancellationToken cancellationToken)
    {
        var settings = await db.OfficeReportSettings.AsNoTracking()
            .Where(x => x.OfficeUserId == null)
            .ToListAsync(cancellationToken);

        var common = ReportCatalog.All
            .Where(report => report.Kind != ReportKind.Franchisee)
            .Select(report => new ReportSettingDto(
                report.Code,
                report.Title,
                ReportCatalog.KindName(report.Kind),
                settings.FirstOrDefault(x => x.ReportCode == report.Code)?.Value ?? string.Empty,
                report.DefaultValue))
            .ToList();

        return new ReportSettingsDto(common);
    }

    [HttpPut("settings/common/{code}")]
    [Authorize(Roles = ReportRoles.Admin)]
    public async Task<IActionResult> UpdateCommonSetting(string code, [FromBody] ReportSettingUpdateRequest request, CancellationToken cancellationToken)
    {
        var report = ReportCatalog.Find(code);
        if (report is null || report.Kind == ReportKind.Franchisee)
        {
            return NotFound(new { message = "Отчёт не найден." });
        }

        var value = ReportSettingsWriter.Clean(request.Value);
        if (value is not null && ReportSettingsWriter.Validate(report.Kind, value) is string error)
        {
            return BadRequest(new { message = error });
        }

        await ReportSettingsWriter.StageAsync(db, report.Code, null, value, User.Identity?.Name, cancellationToken);
        await db.SaveChangesAsync(cancellationToken);
        return NoContent();
    }

    // ===================== Общие помощники =====================

    private int? CurrentUserId => int.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;

    private async Task<OfficeUser?> GetCurrentUserAsync(CancellationToken cancellationToken) =>
        CurrentUserId is int id
            ? await db.OfficeUser.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, cancellationToken)
            : null;

    private Task<List<OfficeReportSetting>> LoadSettingsAsync(IReadOnlyCollection<string> codes, int? userId, CancellationToken cancellationToken) =>
        db.OfficeReportSettings.AsNoTracking()
            .Where(x => codes.Contains(x.ReportCode) && (x.OfficeUserId == null || x.OfficeUserId == userId))
            .ToListAsync(cancellationToken);

    private async Task<string?> GetFilesRootAsync(CancellationToken cancellationToken) =>
        ReportSettingsWriter.Clean(await db.OfficeReportSettings.AsNoTracking()
            .Where(x => x.ReportCode == ReportCatalog.Other && x.OfficeUserId == null)
            .Select(x => x.Value)
            .FirstOrDefaultAsync(cancellationToken));

    private Task<bool> UserHasRoleAsync(int userId, string role, CancellationToken cancellationToken) =>
        db.OfficeUser.AsNoTracking()
            .Where(x => x.Id == userId)
            .SelectMany(x => x.OfficeGroup)
            .SelectMany(x => x.OfficeRole)
            .AnyAsync(x => x.Role == role, cancellationToken);

    private static bool IsVisible(FileSystemInfo entry) =>
        !entry.Attributes.HasFlag(FileAttributes.Hidden)
        && !entry.Attributes.HasFlag(FileAttributes.System)
        && !entry.Name.StartsWith("~$", StringComparison.Ordinal);

    private static string NormalizeRelativePath(string? path) =>
        (path ?? string.Empty).Replace('\\', '/').Trim('/');

    private static string? JoinName(params string?[] parts)
    {
        var name = string.Join(" ", parts.Select(ReportSettingsWriter.Clean).OfType<string>());
        return name.Length > 0 ? name : null;
    }

    private static DateTime MoscowNow() => TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, MoscowTimeZone);

    private static TimeZoneInfo ResolveMoscowTimeZone()
    {
        foreach (var id in new[] { "Russian Standard Time", "Europe/Moscow" })
        {
            try
            {
                return TimeZoneInfo.FindSystemTimeZoneById(id);
            }
            catch (Exception exception) when (exception is TimeZoneNotFoundException or InvalidTimeZoneException)
            {
            }
        }

        return TimeZoneInfo.CreateCustomTimeZone("MSK", TimeSpan.FromHours(3), "MSK", "MSK");
    }
}
