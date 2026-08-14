using System.IO.Compression;
using System.Text;
using System.Xml.Linq;

namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>Текст из word/document.xml (.docx/.docm) — параграфы и текст ячеек таблиц, без форматирования.</summary>
public static class DocxTextExtractor
{
    public static async Task<string?> ExtractAsync(string fullPath, CancellationToken cancellationToken)
    {
        await using var fileStream = File.OpenRead(fullPath);
        using var archive = new ZipArchive(fileStream, ZipArchiveMode.Read, leaveOpen: false);
        cancellationToken.ThrowIfCancellationRequested();

        var document = ZipXmlHelper.ReadEntryAsXml(archive, "word/document.xml");
        if (document?.Root is null) return null;

        var output = new StringBuilder();
        // Параграфы могут быть вложены в ячейки таблиц — берём все w:p из документа как есть,
        // порядок обхода XDocument уже соответствует порядку в документе.
        foreach (var paragraph in document.Root.Descendants().Where(e => e.Name.LocalName == "p"))
        {
            var paragraphHasText = false;
            foreach (var node in paragraph.Descendants().Where(e => e.Name.LocalName is "t" or "tab"))
            {
                if (node.Name.LocalName == "tab") { output.Append(' '); continue; }
                var value = node.Value;
                if (value.Length == 0) continue;
                output.Append(value);
                paragraphHasText = true;
            }
            if (paragraphHasText) output.Append(' ');
        }

        var result = System.Text.RegularExpressions.Regex.Replace(output.ToString(), @"\s+", " ").Trim();
        return result.Length == 0 ? null : result;
    }
}
