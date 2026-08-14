using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Office.Server.DbContexts.RKNETDB;
using Office.Server.DbContexts.RKNETDB.Models;
using Office.Server.KnowledgeLibrary.ContentExtraction;

namespace Office.Server.KnowledgeLibrary;

public sealed class KnowledgeLibraryIndexer(
    RKNETDBContext db,
    ILogger<KnowledgeLibraryIndexer> logger)
{
    public async Task IndexSectionAsync(Guid sectionId, CancellationToken cancellationToken)
    {
        var section = await db.OfficeKnowledgeSections.FirstOrDefaultAsync(x => x.Id == sectionId, cancellationToken);
        if (section is null || !section.IsActive)
            return;

        section.IndexStatus = "Indexing";
        section.IndexError = null;
        await db.SaveChangesAsync(cancellationToken);

        var indexedAt = DateTime.UtcNow;
        var found = new Dictionary<string, IndexedEntry>(StringComparer.OrdinalIgnoreCase);
        var scanErrors = new List<(string Path, string Message)>();

        try
        {
            if (!Directory.Exists(section.RootPath))
                throw new DirectoryNotFoundException("Сетевая папка недоступна или не существует.");

            ScanDirectory(section.RootPath, section.RootPath, found, scanErrors, cancellationToken);
            RemoveFoldersWithoutAllowedFiles(found);

            var existing = await db.OfficeKnowledgeDocuments
                .Where(x => x.SectionId == sectionId)
                .ToDictionaryAsync(x => x.RelativePath, StringComparer.OrdinalIgnoreCase, cancellationToken);

            foreach (var entry in found.Values)
            {
                if (existing.Remove(entry.RelativePath, out var document))
                {
                    // Содержимое перечитываем, только если файл реально изменился, либо текста ещё
                    // нет (новая колонка на старых строках, или прошлая попытка не удалась) —
                    // иначе на каждой периодической переиндексации пришлось бы заново парсить всё
                    // подряд. Из-за этого условия первая переиндексация после появления этой
                    // колонки сама "довяжет" содержимое ко всем уже проиндексированным файлам.
                    var changed = document.Size != entry.Size || document.LastWriteTimeUtc != entry.LastWriteTimeUtc;
                    document.Name = entry.Name;
                    document.Extension = entry.Extension;
                    document.IsDirectory = entry.IsDirectory;
                    document.Size = entry.Size;
                    document.LastWriteTimeUtc = entry.LastWriteTimeUtc;
                    document.IndexedAtUtc = indexedAt;
                    if (changed || document.Content is null)
                        document.Content = await ExtractContentAsync(section.RootPath, entry, cancellationToken);
                }
                else
                {
                    db.OfficeKnowledgeDocuments.Add(new OfficeKnowledgeDocument
                    {
                        Id = CreateStableId(sectionId, entry.RelativePath),
                        SectionId = sectionId,
                        RelativePath = entry.RelativePath,
                        Name = entry.Name,
                        Extension = entry.Extension,
                        IsDirectory = entry.IsDirectory,
                        Size = entry.Size,
                        LastWriteTimeUtc = entry.LastWriteTimeUtc,
                        IndexedAtUtc = indexedAt,
                        Content = await ExtractContentAsync(section.RootPath, entry, cancellationToken)
                    });
                }
            }

            db.OfficeKnowledgeDocuments.RemoveRange(existing.Values);

            var oldErrors = await db.OfficeKnowledgeIndexErrors.Where(x => x.SectionId == sectionId).ToListAsync(cancellationToken);
            db.OfficeKnowledgeIndexErrors.RemoveRange(oldErrors);
            db.OfficeKnowledgeIndexErrors.AddRange(scanErrors.Take(100).Select(error => new OfficeKnowledgeIndexError
            {
                SectionId = sectionId,
                Path = Truncate(error.Path, 1024),
                Message = Truncate(error.Message, 1000),
                CreatedAtUtc = indexedAt
            }));

            section.LastIndexedAtUtc = indexedAt;
            section.IndexStatus = scanErrors.Count == 0 ? "Ready" : "ReadyWithErrors";
            section.IndexError = scanErrors.Count == 0 ? null : $"Не удалось прочитать объектов: {scanErrors.Count}";
            await db.SaveChangesAsync(cancellationToken);
            logger.LogInformation("Knowledge section {SectionId} indexed: {EntryCount} entries, {ErrorCount} errors.", sectionId, found.Count, scanErrors.Count);
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            section.IndexStatus = "Error";
            section.IndexError = Truncate(ex.Message, 1000);
            await db.SaveChangesAsync(CancellationToken.None);
            logger.LogError(ex, "Failed to index knowledge section {SectionId}.", sectionId);
        }
    }

    private static void ScanDirectory(
        string root,
        string current,
        IDictionary<string, IndexedEntry> found,
        ICollection<(string Path, string Message)> errors,
        CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        IEnumerable<string> directories;
        IEnumerable<string> files;

        try
        {
            directories = Directory.EnumerateDirectories(current).ToArray();
            files = Directory.EnumerateFiles(current).ToArray();
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            errors.Add((current, ex.Message));
            return;
        }

        foreach (var directory in directories)
        {
            cancellationToken.ThrowIfCancellationRequested();
            try
            {
                var info = new DirectoryInfo(directory);
                if ((info.Attributes & (FileAttributes.Hidden | FileAttributes.System | FileAttributes.ReparsePoint)) != 0)
                    continue;

                var relativePath = NormalizeRelativePath(root, directory);
                found[relativePath] = new IndexedEntry(relativePath, info.Name, string.Empty, true, 0, info.LastWriteTimeUtc);
                ScanDirectory(root, directory, found, errors, cancellationToken);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                errors.Add((directory, ex.Message));
            }
        }

        foreach (var file in files)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!KnowledgeLibraryFilePolicy.IsAllowedFile(file))
                continue;

            try
            {
                var info = new FileInfo(file);
                if ((info.Attributes & (FileAttributes.Hidden | FileAttributes.System)) != 0)
                    continue;

                var relativePath = NormalizeRelativePath(root, file);
                found[relativePath] = new IndexedEntry(
                    relativePath,
                    info.Name,
                    info.Extension.ToLowerInvariant(),
                    false,
                    info.Length,
                    info.LastWriteTimeUtc);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                errors.Add((file, ex.Message));
            }
        }
    }

    private static string NormalizeRelativePath(string root, string path) =>
        Path.GetRelativePath(root, path).Replace('\\', '/');

    private static void RemoveFoldersWithoutAllowedFiles(IDictionary<string, IndexedEntry> found)
    {
        var foldersWithFiles = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var file in found.Values.Where(x => !x.IsDirectory))
        {
            var parent = file.RelativePath;
            while (parent.LastIndexOf('/') is var separator && separator >= 0)
            {
                parent = parent[..separator];
                foldersWithFiles.Add(parent);
            }
        }
        var emptyFolders = found.Values
            .Where(x => x.IsDirectory)
            .Where(folder => !foldersWithFiles.Contains(folder.RelativePath))
            .Select(x => x.RelativePath)
            .ToArray();
        foreach (var path in emptyFolders)
            found.Remove(path);
    }

    private static Guid CreateStableId(Guid sectionId, string relativePath)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes($"{sectionId:N}|{relativePath.ToUpperInvariant()}"));
        return new Guid(bytes.AsSpan(0, 16));
    }

    private static string Truncate(string value, int length) => value.Length <= length ? value : value[..length];

    /// <summary>
    /// Извлечение текста файла для поиска по содержимому. Отдельно от основного индексатора —
    /// любая ошибка (битый файл, неподдерживаемый формат, недоступный сетевой путь) гасится
    /// внутри KnowledgeLibraryContentExtractor и превращается в null, метаданные файла это не трогает.
    /// </summary>
    private static async Task<string?> ExtractContentAsync(string rootPath, IndexedEntry entry, CancellationToken cancellationToken)
    {
        if (entry.IsDirectory || !KnowledgeLibraryContentExtractor.IsSupported(entry.Extension))
            return null;
        if (!KnowledgeLibraryFilePolicy.TryResolvePath(rootPath, entry.RelativePath, out var fullPath))
            return null;
        return await KnowledgeLibraryContentExtractor.ExtractAsync(fullPath, entry.Extension, entry.Size, cancellationToken);
    }

    private sealed record IndexedEntry(
        string RelativePath,
        string Name,
        string Extension,
        bool IsDirectory,
        long Size,
        DateTime LastWriteTimeUtc);
}
