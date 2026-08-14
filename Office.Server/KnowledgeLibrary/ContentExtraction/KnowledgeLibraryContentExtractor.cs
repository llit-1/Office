namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>
/// Точка входа для извлечения текста из файла библиотеки знаний при индексации.
/// Формат определяется по расширению; неизвестные/неподдерживаемые форматы (изображения,
/// видео, легаси .ppt) просто дают null — такие файлы остаются доступны только по имени, как раньше.
/// Любая ошибка извлечения (битый файл, пароль, неожиданная структура) гасится здесь и превращается
/// в null — сбой чтения содержимого не должен ронять индексацию файла целиком (имя/путь/размер
/// в любом случае должны сохраниться).
/// </summary>
public static class KnowledgeLibraryContentExtractor
{
    /// <summary>Файлы больше этого размера не читаем на содержимое — слишком дорого для фоновой переиндексации.</summary>
    public const long MaxSourceFileSize = 25 * 1024 * 1024;

    /// <summary>Ограничение на длину извлечённого текста, который реально уходит в базу.</summary>
    public const int MaxContentLength = 500_000;

    /// <summary>
    /// Форматы, для которых вообще имеет смысл пытаться читать содержимое. Легаси .ppt сюда
    /// намеренно не входит — для него, в отличие от .doc/.xls, нет уже готового парсера,
    /// а формат достаточно другой, чтобы не переиспользовать CFB-код "на скорую руку".
    /// Изображения/видео из общего списка разрешённых файлов библиотеки — не текстовые форматы,
    /// их тут тоже нет.
    /// </summary>
    private static readonly HashSet<string> SupportedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".csv", ".txt", ".md", ".rtf",
        ".docx", ".docm", ".xlsx", ".xlsm", ".pptx", ".pptm",
        ".odt", ".ods", ".odp",
        ".pdf", ".xls", ".doc",
    };

    public static bool IsSupported(string extension) => SupportedExtensions.Contains(extension);

    public static async Task<string?> ExtractAsync(string fullPath, string extension, long fileSize, CancellationToken cancellationToken)
    {
        if (fileSize <= 0 || fileSize > MaxSourceFileSize)
            return null;

        var normalized = extension.ToLowerInvariant();

        try
        {
            var text = normalized switch
            {
                ".csv" or ".txt" or ".md" => await PlainTextExtractor.ExtractAsync(fullPath, cancellationToken),
                ".rtf" => await RtfTextExtractor.ExtractAsync(fullPath, cancellationToken),
                ".docx" or ".docm" => await DocxTextExtractor.ExtractAsync(fullPath, cancellationToken),
                ".xlsx" or ".xlsm" => await XlsxTextExtractor.ExtractAsync(fullPath, cancellationToken),
                ".pptx" or ".pptm" => await PptxTextExtractor.ExtractAsync(fullPath, cancellationToken),
                ".odt" or ".ods" or ".odp" => await OpenDocumentTextExtractor.ExtractAsync(fullPath, cancellationToken),
                ".pdf" => await PdfTextExtractor.ExtractAsync(fullPath, cancellationToken),
                ".xls" => await Task.Run(() => LegacyXlsTextExtractor.Extract(File.ReadAllBytes(fullPath)), cancellationToken),
                ".doc" => await Task.Run(() => LegacyDocTextExtractor.Extract(File.ReadAllBytes(fullPath)), cancellationToken),
                _ => null,
            };
            return Truncate(text);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception)
        {
            // Извлечение содержимого — вспомогательная функция для поиска, а не основная задача
            // индексатора. Файл при этом всё равно проиндексируется по имени/пути, как раньше.
            return null;
        }
    }

    private static string? Truncate(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        return text.Length > MaxContentLength ? text[..MaxContentLength] : text;
    }
}
