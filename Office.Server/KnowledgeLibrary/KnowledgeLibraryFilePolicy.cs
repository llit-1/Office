namespace Office.Server.KnowledgeLibrary;

public static class KnowledgeLibraryFilePolicy
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".pdf", ".doc", ".docx", ".docm", ".rtf", ".odt",
        ".xls", ".xlsx", ".xlsm", ".csv", ".ods",
        ".ppt", ".pptx", ".pptm", ".odp",
        ".txt", ".md",
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".tif", ".tiff",
        ".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv", ".wmv"
    };

    private static readonly HashSet<string> AllowedCoverExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".webp", ".svg"
    };

    public static bool IsAllowedFile(string path)
    {
        var name = Path.GetFileName(path);
        if (string.IsNullOrWhiteSpace(name) || name.StartsWith("~$", StringComparison.OrdinalIgnoreCase))
            return false;

        return AllowedExtensions.Contains(Path.GetExtension(name));
    }

    public static bool IsAllowedCover(string fileName) => AllowedCoverExtensions.Contains(Path.GetExtension(fileName));

    public static bool IsSafeUncRoot(string path, out string normalized, out string error)
    {
        normalized = string.Empty;
        error = string.Empty;
        if (string.IsNullOrWhiteSpace(path))
        {
            error = "Укажите путь к сетевой папке.";
            return false;
        }

        var trimmed = path.Trim().TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (!trimmed.StartsWith(@"\\", StringComparison.Ordinal) || !Path.IsPathFullyQualified(trimmed))
        {
            error = "Разрешены только полные UNC-пути вида \\\\server\\share\\folder.";
            return false;
        }

        var parts = trimmed[2..].Split(['\\', '/'], StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length < 2 || parts[1].EndsWith('$'))
        {
            error = "Укажите обычную сетевую папку, а не административный ресурс.";
            return false;
        }

        try
        {
            normalized = Path.GetFullPath(trimmed);
            return true;
        }
        catch (Exception)
        {
            error = "Некорректный путь к сетевой папке.";
            return false;
        }
    }

    public static bool TryResolvePath(string rootPath, string relativePath, out string fullPath)
    {
        fullPath = string.Empty;
        try
        {
            var normalizedRoot = Path.GetFullPath(rootPath).TrimEnd('\\', '/');
            var relative = (relativePath ?? string.Empty).Replace('/', '\\').TrimStart('\\');
            var candidate = Path.GetFullPath(Path.Combine(normalizedRoot, relative));
            if (!candidate.Equals(normalizedRoot, StringComparison.OrdinalIgnoreCase)
                && !candidate.StartsWith(normalizedRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
                return false;

            fullPath = candidate;
            return true;
        }
        catch (Exception)
        {
            return false;
        }
    }
}
