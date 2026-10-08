namespace Office.Server.Locations;

/// <summary>Состояние папки документов организации на сетевом диске.</summary>
public sealed record EntityFolderState(bool Exists, bool Available, int FileCount, string? Path);

/// <summary>
/// Папки документов организаций в «Розница. Документы». Имя папки — название организации
/// без недопустимых для файловой системы символов, как в старом портале.
/// </summary>
public class EntityFolderService(IConfiguration configuration, ILogger<EntityFolderService> logger)
{
    public const string DefaultRoot = @"\\shzhleb.ru\ll\LLWork\Розница. Документы";

    public string Root => configuration["Locations:EntityDocumentsRoot"] is { Length: > 0 } root ? root : DefaultRoot;

    public static string? FolderName(string? entityName)
    {
        if (string.IsNullOrWhiteSpace(entityName))
        {
            return null;
        }

        var invalid = System.IO.Path.GetInvalidFileNameChars();
        var sanitized = new string(entityName.Where(symbol => !invalid.Contains(symbol)).ToArray()).Trim().TrimEnd('.');
        return sanitized.Length == 0 ? null : sanitized;
    }

    public string? PathFor(string? entityName) =>
        FolderName(entityName) is string folderName ? System.IO.Path.Combine(Root, folderName) : null;

    public EntityFolderState GetState(string? entityName)
    {
        var path = PathFor(entityName);
        try
        {
            if (path is null)
            {
                return new EntityFolderState(false, Directory.Exists(Root), 0, null);
            }

            if (!Directory.Exists(path))
            {
                // Directory.Exists возвращает false и для недоступного сетевого диска, поэтому проверяем корень.
                return new EntityFolderState(false, Directory.Exists(Root), 0, path);
            }

            var fileCount = Directory.EnumerateFiles(path, "*", SearchOption.AllDirectories).Count();
            return new EntityFolderState(true, true, fileCount, path);
        }
        catch (Exception exception) when (exception is IOException or UnauthorizedAccessException)
        {
            logger.LogWarning(exception, "Entity folder {Path} is unavailable.", path);
            return new EntityFolderState(false, false, 0, path);
        }
    }

    public void Create(string entityName) => Directory.CreateDirectory(PathFor(entityName)!);

    public void Delete(string entityName) => Directory.Delete(PathFor(entityName)!, recursive: true);

    public void Rename(string oldEntityName, string newEntityName)
    {
        var source = PathFor(oldEntityName)!;
        var target = PathFor(newEntityName)!;
        if (string.Equals(source, target, StringComparison.Ordinal))
        {
            return;
        }

        if (string.Equals(source, target, StringComparison.OrdinalIgnoreCase))
        {
            // Смена только регистра на Windows требует промежуточного имени.
            var temporary = $"{source}.rename-{Guid.NewGuid():N}";
            Directory.Move(source, temporary);
            Directory.Move(temporary, target);
            return;
        }

        Directory.Move(source, target);
    }
}
