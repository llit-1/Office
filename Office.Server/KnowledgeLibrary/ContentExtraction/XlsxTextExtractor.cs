using System.IO.Compression;
using System.Text;
using System.Xml.Linq;

namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>
/// Текст из .xlsx/.xlsm. Основной источник — xl/sharedStrings.xml: в нём и так лежит весь
/// уникальный текстовый пул книги (по всем листам сразу), отдельные sheetN.xml открывать не нужно.
/// Исключение — inline-строки (t="inlineStr"), которые в общий пул не попадают: для них
/// дополнительно проходим по листам.
/// </summary>
public static class XlsxTextExtractor
{
    public static async Task<string?> ExtractAsync(string fullPath, CancellationToken cancellationToken)
    {
        await using var fileStream = File.OpenRead(fullPath);
        using var archive = new ZipArchive(fileStream, ZipArchiveMode.Read, leaveOpen: false);
        cancellationToken.ThrowIfCancellationRequested();

        var output = new StringBuilder();

        var sharedStrings = ZipXmlHelper.ReadEntryAsXml(archive, "xl/sharedStrings.xml");
        if (sharedStrings?.Root is not null)
        {
            foreach (var si in sharedStrings.Root.Elements().Where(e => e.Name.LocalName == "si"))
            {
                var text = string.Concat(si.Descendants().Where(e => e.Name.LocalName == "t").Select(e => e.Value));
                if (text.Length > 0) output.Append(text).Append(' ');
            }
        }

        cancellationToken.ThrowIfCancellationRequested();
        foreach (var entry in ZipXmlHelper.EntriesMatching(archive, name =>
                     name.StartsWith("xl/worksheets/", StringComparison.OrdinalIgnoreCase) && name.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)))
        {
            XDocument sheet;
            using (var stream = entry.Open())
                sheet = XDocument.Load(stream);
            if (sheet.Root is null) continue;

            foreach (var inlineString in sheet.Root.Descendants().Where(e => e.Name.LocalName == "is"))
            {
                var text = string.Concat(inlineString.Descendants().Where(e => e.Name.LocalName == "t").Select(e => e.Value));
                if (text.Length > 0) output.Append(text).Append(' ');
            }
        }

        var result = System.Text.RegularExpressions.Regex.Replace(output.ToString(), @"\s+", " ").Trim();
        return result.Length == 0 ? null : result;
    }
}
