using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;

namespace Office.Server.Reports;

/// <summary>Проверка и запись ссылок раздела «Отчёты». Используется в настройках отчётов и в карточке пользователя.</summary>
public static class ReportSettingsWriter
{
    public const int MaxLength = 2000;

    public static string? Clean(string? value)
    {
        var text = value?.Trim();
        return string.IsNullOrEmpty(text) ? null : text;
    }

    public static string? Validate(ReportKind kind, string value)
    {
        if (value.Length > MaxLength)
        {
            return $"Значение не должно быть длиннее {MaxLength} символов.";
        }

        if (kind == ReportKind.Files)
        {
            return Path.IsPathFullyQualified(value) ? null : @"Укажите полный путь к папке, например \\server\share\Отчёты.";
        }

        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) || (uri.Scheme != Uri.UriSchemeHttps && uri.Scheme != Uri.UriSchemeHttp))
        {
            return "Укажите полную ссылку, которая начинается с https://.";
        }

        // Портал работает по HTTPS, и браузер не покажет во фрейме страницу по HTTP.
        return kind == ReportKind.PowerBi && uri.Scheme != Uri.UriSchemeHttps
            ? "Для отчётов, которые открываются внутри портала, нужна ссылка https://."
            : null;
    }

    /// <summary>
    /// Добавляет, изменяет или удаляет (пустое значение) запись без SaveChanges,
    /// чтобы вызывающий код сохранил её вместе с остальными изменениями.
    /// </summary>
    public static async Task StageAsync(
        RKNETDBContext db,
        string code,
        int? userId,
        string? value,
        string? updatedBy,
        CancellationToken cancellationToken = default)
    {
        var clean = Clean(value);
        var row = await db.OfficeReportSettings.FirstOrDefaultAsync(x => x.ReportCode == code && x.OfficeUserId == userId, cancellationToken);
        if (clean is null)
        {
            if (row is not null)
            {
                db.OfficeReportSettings.Remove(row);
            }

            return;
        }

        if (row is null)
        {
            row = new OfficeReportSetting { ReportCode = code, OfficeUserId = userId };
            db.OfficeReportSettings.Add(row);
        }

        row.Value = clean;
        row.UpdatedAtUtc = DateTime.UtcNow;
        row.UpdatedBy = updatedBy;
    }
}
