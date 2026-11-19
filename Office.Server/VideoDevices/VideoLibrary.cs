using System.Net;
using System.Net.Sockets;
using System.Text.RegularExpressions;
using Microsoft.Net.Http.Headers;

namespace Office.Server.VideoDevices;

/// <summary>
/// Общие правила работы с папкой ВидеоТВ и данными приставок.
/// Всё, что приходит из запроса (имена файлов, относительные пути, IP), проверяется здесь,
/// чтобы ни один эндпоинт не мог отдать файл за пределами папки или сходить на произвольный адрес.
/// </summary>
public static partial class VideoLibrary
{
    public const string DefaultRootPath = @"\\shzhleb.ru\shz\SHZWork\Обмен2\ВидеоТВ";
    public const string MusicDirectoryName = "Музыка";
    public const string DefaultAdsDirectoryName = "Реклама";
    public const int DefaultDevicePort = 8080;

    public static readonly HashSet<string> VideoExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp4", ".avi", ".mov", ".mpeg"
    };

    public static readonly HashSet<string> AudioExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".mp3", ".wav", ".flac", ".aac", ".ogg"
    };

    // Символы, которые ломают хранимый формат списка "[a.mp4,b.mp4]" (его читает и старый портал).
    private static readonly char[] VideoListReservedChars = [',', '[', ']', '"'];

    /// <summary>Синхронизация библиотеки с диском пишет в БД — параллельные вызовы давали дубли и сбитые позиции.</summary>
    public static readonly object SyncLock = new();

    public static string GetRootPath(IConfiguration configuration)
    {
        var configured = configuration["VideoDevices:RootPath"];
        return string.IsNullOrWhiteSpace(configured) ? DefaultRootPath : configured.Trim();
    }

    public static string ContentTypeFor(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".mp4" => "video/mp4",
        ".avi" => "video/x-msvideo",
        ".mov" => "video/quicktime",
        ".mpeg" => "video/mpeg",
        ".mp3" => "audio/mpeg",
        ".wav" => "audio/wav",
        ".flac" => "audio/flac",
        ".aac" => "audio/aac",
        ".ogg" => "audio/ogg",
        ".apk" => "application/vnd.android.package-archive",
        _ => "application/octet-stream"
    };

    /// <summary>
    /// Видео лежат только в корне папки ВидеоТВ. Принимается голое имя файла с разрешённым расширением,
    /// любые разделители каталогов и ".." отклоняются.
    /// </summary>
    public static bool TryResolveVideoFile(string rootPath, string? fileName, out string fullPath)
    {
        fullPath = string.Empty;
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return false;
        }

        var name = fileName.Trim();
        if (name != Path.GetFileName(name)
            || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0
            || name is "." or ".."
            || !VideoExtensions.Contains(Path.GetExtension(name)))
        {
            return false;
        }

        return TryResolveInside(rootPath, name, out fullPath);
    }

    /// <summary>APK лежат в корне папки ВидеоТВ (рядом с роликами). Только голое имя файла с расширением .apk.</summary>
    public static bool TryResolveApkFile(string rootPath, string? fileName, out string fullPath)
    {
        fullPath = string.Empty;
        if (string.IsNullOrWhiteSpace(fileName))
        {
            return false;
        }

        var name = fileName.Trim();
        if (name != Path.GetFileName(name)
            || name.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0
            || name.StartsWith('.')
            || !name.EndsWith(".apk", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return TryResolveInside(rootPath, name, out fullPath);
    }

    /// <summary>
    /// Аудио (музыка и реклама) лежит в подпапках ВидеоТВ. Путь задаётся относительно корня,
    /// после нормализации он обязан остаться внутри корня.
    /// </summary>
    public static bool TryResolveAudioFile(string rootPath, string? relativePath, out string fullPath)
    {
        fullPath = string.Empty;
        if (string.IsNullOrWhiteSpace(relativePath))
        {
            return false;
        }

        var path = relativePath.Trim().Replace('/', Path.DirectorySeparatorChar);
        if (Path.IsPathRooted(path) || !AudioExtensions.Contains(Path.GetExtension(path)))
        {
            return false;
        }

        return TryResolveInside(rootPath, path, out fullPath);
    }

    public static string ToRelativePath(string rootPath, string fullPath)
    {
        return Path.GetRelativePath(Path.GetFullPath(rootPath), fullPath).Replace(Path.DirectorySeparatorChar, '/');
    }

    private static bool TryResolveInside(string rootPath, string relativePath, out string fullPath)
    {
        fullPath = string.Empty;
        try
        {
            var root = Path.TrimEndingDirectorySeparator(Path.GetFullPath(rootPath)) + Path.DirectorySeparatorChar;
            var candidate = Path.GetFullPath(Path.Combine(root, relativePath));
            if (!candidate.StartsWith(root, StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            fullPath = candidate;
            return true;
        }
        catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
        {
            return false;
        }
    }

    /// <summary>
    /// Папка рекламы — только существующая подпапка первого уровня. Имя приходит из БД,
    /// но его могли записать через старый портал, поэтому проверяем ещё раз.
    /// </summary>
    public static string? ResolveAdsDirectory(string rootPath, string? customAds)
    {
        var candidates = new[] { customAds?.Trim(), DefaultAdsDirectoryName };
        foreach (var name in candidates)
        {
            if (string.IsNullOrWhiteSpace(name) || name != Path.GetFileName(name) || name is "." or "..")
            {
                continue;
            }

            var dir = Path.Combine(rootPath, name);
            if (Directory.Exists(dir))
            {
                return dir;
            }
        }

        return null;
    }

    public static List<string> ParseVideoList(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return [];
        }

        return value
            .Trim()
            .Trim('[', ']')
            .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => x.Trim('"').Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();
    }

    /// <summary>Формат "[a.mp4,b.mp4]" сохранён ради старого портала и старых версий приложения.</summary>
    public static string SerializeVideoList(IEnumerable<string>? videoNames)
    {
        var values = videoNames?
            .Select(x => x.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList() ?? [];

        return $"[{string.Join(",", values)}]";
    }

    public static bool IsStorableVideoName(string name) => name.IndexOfAny(VideoListReservedChars) < 0;

    /// <summary>
    /// Адрес приставки — только IPv4 из частных сетей и только порт приложения 8080 (его можно не указывать).
    /// Так через портал нельзя отправить запрос на произвольный хост, порт или во внешнюю сеть.
    /// </summary>
    public static bool TryNormalizeDeviceAddress(string? input, out string normalized)
    {
        normalized = string.Empty;
        if (string.IsNullOrWhiteSpace(input))
        {
            return false;
        }

        var match = DeviceAddressRegex().Match(input.Trim());
        if (!match.Success
            || !IPAddress.TryParse(match.Groups["host"].Value, out var address)
            || address.AddressFamily != AddressFamily.InterNetwork
            || !IsPrivateIpv4(address))
        {
            return false;
        }

        if (match.Groups["port"].Success
            && (!int.TryParse(match.Groups["port"].Value, out var port) || port != DefaultDevicePort))
        {
            return false;
        }

        normalized = $"{address}:{DefaultDevicePort}";
        return true;
    }

    /// <summary>
    /// Версия, которую сообщает приставка (versionName приложения, например "1.9" или "2.0").
    /// Всё остальное — не наше приложение или мусор: не показываем и не пишем в БД (поле Version — 50 символов).
    /// </summary>
    public static bool IsValidAppVersion(string? value) =>
        !string.IsNullOrEmpty(value) && value.Length <= 20 && AppVersionRegex().IsMatch(value);

    [GeneratedRegex(@"^\d{1,4}(\.\d{1,4}){0,3}$")]
    private static partial Regex AppVersionRegex();

    /// <summary>
    /// Файл можно отдавать приставкам: он не менялся последние <paramref name="minAge"/> и его сейчас никто не пишет.
    /// Файл, который ещё копируется на шару, приставка скачала бы обрезанным.
    /// </summary>
    public static bool IsFileStable(string fullPath, TimeSpan minAge)
    {
        try
        {
            var info = new FileInfo(fullPath);
            if (!info.Exists || info.LastWriteTimeUtc > DateTime.UtcNow - minAge)
            {
                return false;
            }

            using var probe = OpenForServing(fullPath);
            return true;
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    /// <summary>
    /// Открывает файл на чтение, запрещая запись другим. Если файл сейчас кто-то пишет (идёт копирование),
    /// открытие падает с IOException — недописанный файл так не уйдёт приставке.
    /// </summary>
    public static FileStream OpenForServing(string fullPath) =>
        new(fullPath, FileMode.Open, FileAccess.Read, FileShare.Read, 64 * 1024,
            FileOptions.Asynchronous | FileOptions.SequentialScan);

    /// <summary>
    /// Сильный ETag из размера и времени изменения: по нему приставка докачивает файл через If-Range
    /// и получает файл заново, если его успели заменить.
    /// </summary>
    public static EntityTagHeaderValue ETagFor(FileInfo info) =>
        new($"\"{info.Length:x}-{info.LastWriteTimeUtc.Ticks:x}\"");

    public static string HostOf(string normalizedAddress) => normalizedAddress[..normalizedAddress.LastIndexOf(':')];

    private static bool IsPrivateIpv4(IPAddress address)
    {
        var b = address.GetAddressBytes();
        return b[0] == 10
            || (b[0] == 172 && b[1] is >= 16 and <= 31)
            || (b[0] == 192 && b[1] == 168);
    }

    [GeneratedRegex(@"^(?<host>\d{1,3}(\.\d{1,3}){3})(:(?<port>\d{1,5}))?$")]
    private static partial Regex DeviceAddressRegex();

    /// <summary>
    /// Актуальная версия — APK с наибольшей версией в имени (1.10 &gt; 1.9), при равенстве — самый свежий файл.
    /// Раньше брался первый попавшийся файл, и при нескольких APK версия «прыгала».
    /// </summary>
    /// <summary>
    /// Свободно на разделе по выводу «df -k /data», МБ. Свободное место — число перед «NN%» в строке раздела:
    /// так работает и обычный формат, и тот, где длинное имя устройства перенесено на отдельную строку.
    /// </summary>
    public static long? ParseDfFreeMb(string? dfOutput)
    {
        if (string.IsNullOrWhiteSpace(dfOutput))
        {
            return null;
        }

        foreach (var line in dfOutput.Split('\n', StringSplitOptions.RemoveEmptyEntries).Reverse())
        {
            var tokens = line.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
            var percent = Array.FindIndex(tokens, t => t.Length > 1 && t.EndsWith('%') && char.IsDigit(t[0]));
            if (percent >= 1 && long.TryParse(tokens[percent - 1], out var freeKb))
            {
                return freeKb / 1024;
            }
        }

        return null;
    }

    public static IEnumerable<FileInfo> OrderApkFiles(IEnumerable<FileInfo> files)
    {
        return files
            .OrderByDescending(f => System.Version.TryParse(Path.GetFileNameWithoutExtension(f.Name), out var v) ? v : null)
            .ThenByDescending(f => f.LastWriteTimeUtc)
            .ThenBy(f => f.Name, StringComparer.OrdinalIgnoreCase);
    }
}
