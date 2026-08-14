using System.IO.Compression;
using System.Xml.Linq;

namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>
/// Текст из OpenDocument-форматов (.odt/.ods/.odp) — content.xml внутри zip. В отличие от
/// docx/xlsx здесь не разбираем структуру параграфов/ячеек по отдельности: office:body в
/// OpenDocument содержит весь видимый текст документа (параграфы, ячейки таблиц, слайды и т.д.)
/// как текстовые узлы — берём его целиком через XElement.Value, этого достаточно для поиска.
/// </summary>
public static class OpenDocumentTextExtractor
{
    public static async Task<string?> ExtractAsync(string fullPath, CancellationToken cancellationToken)
    {
        await using var fileStream = File.OpenRead(fullPath);
        using var archive = new ZipArchive(fileStream, ZipArchiveMode.Read, leaveOpen: false);
        cancellationToken.ThrowIfCancellationRequested();

        var content = ZipXmlHelper.ReadEntryAsXml(archive, "content.xml");
        if (content?.Root is null) return null;

        var body = content.Root.Descendants().FirstOrDefault(e => e.Name.LocalName == "body");
        if (body is null) return null;

        var result = System.Text.RegularExpressions.Regex.Replace(body.Value, @"\s+", " ").Trim();
        return result.Length == 0 ? null : result;
    }
}
