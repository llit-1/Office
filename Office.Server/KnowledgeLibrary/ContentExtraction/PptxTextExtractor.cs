using System.IO.Compression;
using System.Text;
using System.Xml.Linq;

namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>
/// Текст из .pptx/.pptm — у презентаций нет общего пула строк, как в xlsx, текст лежит
/// прямо в каждом ppt/slides/slideN.xml (и, опционально, в заметках к слайдам).
/// </summary>
public static class PptxTextExtractor
{
    public static async Task<string?> ExtractAsync(string fullPath, CancellationToken cancellationToken)
    {
        await using var fileStream = File.OpenRead(fullPath);
        using var archive = new ZipArchive(fileStream, ZipArchiveMode.Read, leaveOpen: false);
        cancellationToken.ThrowIfCancellationRequested();

        var output = new StringBuilder();
        foreach (var entry in ZipXmlHelper.EntriesMatching(archive, name =>
                     (name.StartsWith("ppt/slides/slide", StringComparison.OrdinalIgnoreCase)
                      || name.StartsWith("ppt/notesSlides/notesSlide", StringComparison.OrdinalIgnoreCase))
                     && name.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)))
        {
            XDocument slide;
            using (var stream = entry.Open())
                slide = XDocument.Load(stream);
            if (slide.Root is null) continue;

            foreach (var text in ZipXmlHelper.TextOf(slide.Root, "t"))
                if (text.Length > 0) output.Append(text).Append(' ');
        }

        var result = System.Text.RegularExpressions.Regex.Replace(output.ToString(), @"\s+", " ").Trim();
        return result.Length == 0 ? null : result;
    }
}
