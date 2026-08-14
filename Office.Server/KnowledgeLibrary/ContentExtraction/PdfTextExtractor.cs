using System.Text;
using System.Text.RegularExpressions;
using UglyToad.PdfPig;

namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>
/// Текст из PDF через PdfPig (MIT, чистый managed-код, без нативных зависимостей).
/// Полноценный разбор PDF (шрифты, CMap-таблицы для нестандартных кодировок символов —
/// без них извлечённый "текст" у многих PDF превращается в мусор) — не то, что стоит
/// писать руками, в отличие от Office-форматов выше: тут готовая библиотека оправдана.
/// </summary>
public static class PdfTextExtractor
{
    private const int MaxPages = 300;

    public static Task<string?> ExtractAsync(string fullPath, CancellationToken cancellationToken) =>
        Task.Run(() => Extract(fullPath, cancellationToken), cancellationToken);

    private static string? Extract(string fullPath, CancellationToken cancellationToken)
    {
        using var document = PdfDocument.Open(fullPath);
        var output = new StringBuilder();
        var pageIndex = 0;
        foreach (var page in document.GetPages())
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (++pageIndex > MaxPages) break;
            var text = page.Text;
            if (!string.IsNullOrWhiteSpace(text)) output.Append(text).Append(' ');
        }

        var result = Regex.Replace(output.ToString(), @"\s+", " ").Trim();
        return result.Length == 0 ? null : result;
    }
}
