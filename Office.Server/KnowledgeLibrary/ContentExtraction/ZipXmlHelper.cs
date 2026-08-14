using System.IO.Compression;
using System.Xml.Linq;

namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>
/// Общий помощник для форматов "zip с XML внутри" (docx/xlsx/pptx — OOXML, odt/ods/odp —
/// OpenDocument). Специально не тянем DocumentFormat.OpenXml/ClosedXML — для извлечения текста
/// (не рендера) хватает System.IO.Compression + System.Xml.Linq из BCL, без новых NuGet-зависимостей.
/// Совпадения элементов — по LocalName, без привязки к конкретному namespace-префиксу: разные
/// генераторы документов иногда используют нестандартные префиксы для одних и тех же namespace'ов.
/// </summary>
public static class ZipXmlHelper
{
    public static XDocument? ReadEntryAsXml(ZipArchive archive, string entryName)
    {
        var entry = archive.Entries.FirstOrDefault(e => string.Equals(e.FullName, entryName, StringComparison.OrdinalIgnoreCase));
        if (entry is null) return null;
        using var stream = entry.Open();
        return XDocument.Load(stream, LoadOptions.None);
    }

    public static IEnumerable<ZipArchiveEntry> EntriesMatching(ZipArchive archive, Func<string, bool> predicate) =>
        archive.Entries.Where(e => predicate(e.FullName));

    /// <summary>Текст всех элементов с данным LocalName, в порядке документа.</summary>
    public static IEnumerable<string> TextOf(XElement root, string localName) =>
        root.Descendants().Where(e => e.Name.LocalName == localName).Select(e => e.Value);
}
