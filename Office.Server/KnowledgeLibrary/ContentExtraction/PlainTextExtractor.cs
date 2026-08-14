using System.Text;

namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>
/// .txt/.md/.csv — читаем как есть. Кодировку не знаем заранее (может не быть BOM), поэтому
/// применяем ту же эвристику, что и в office.client (decodeText в loadOfficeDocument.ts):
/// пробуем UTF-8, и если слишком много символов замены — считаем, что это Windows-1251.
/// </summary>
public static class PlainTextExtractor
{
    public static async Task<string?> ExtractAsync(string fullPath, CancellationToken cancellationToken)
    {
        var bytes = await File.ReadAllBytesAsync(fullPath, cancellationToken);
        return Decode(bytes);
    }

    public static string Decode(byte[] bytes)
    {
        var utf8 = Encoding.UTF8.GetString(bytes);
        var replacements = 0;
        foreach (var ch in utf8)
            if (ch == '�') replacements++;

        if (replacements > Math.Max(3, utf8.Length * 0.01))
            return Windows1251.Decode(bytes);

        return utf8;
    }
}
