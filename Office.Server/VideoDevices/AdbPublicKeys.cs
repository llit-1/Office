using System.Text.RegularExpressions;

namespace Office.Server.VideoDevices;

/// <summary>
/// Публичные ключи ADB в формате файла adbkey.pub: «&lt;base64&gt; &lt;подпись&gt;».
/// base64 — структура RSA-ключа Android (524 байта: длина в словах = 64, n0inv, модуль, R², экспонента).
/// Приставка пишет эти строки в adb_keys через root, поэтому формат проверяется строго:
/// любая лишняя строка там — это чужой доступ к приставке.
/// </summary>
public static partial class AdbPublicKeys
{
    public const int KeyStructSize = 524;
    private const int ModulusWords = 64;
    private const int MaxCommentLength = 100;

    /// <summary>Приводит ключ к виду «base64 подпись» (одна строка). null — ключ некорректный.</summary>
    public static string? Normalize(string? publicKey)
    {
        if (string.IsNullOrWhiteSpace(publicKey))
        {
            return null;
        }

        var trimmed = publicKey.Trim();
        if (trimmed.Contains('\n') || trimmed.Contains('\r'))
        {
            return null;
        }

        var space = trimmed.IndexOf(' ');
        var body = space < 0 ? trimmed : trimmed[..space];
        var comment = space < 0 ? "" : trimmed[(space + 1)..].Trim();
        if (!IsValidBody(body))
        {
            return null;
        }

        // Подпись (обычно «пользователь@компьютер») бывает с кириллицей — такую не отдаём, ключ остаётся
        var safeComment = comment.Length <= MaxCommentLength && CommentRegex().IsMatch(comment);
        return comment.Length == 0 || !safeComment ? body : $"{body} {comment}";
    }

    public static bool IsValidBody(string body)
    {
        if (!Base64Regex().IsMatch(body))
        {
            return false;
        }

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(body);
        }
        catch (FormatException)
        {
            return false;
        }

        return bytes.Length == KeyStructSize && BitConverter.ToInt32(bytes, 0) == ModulusWords;
    }

    [GeneratedRegex("^[A-Za-z0-9+/]+={0,2}$")]
    private static partial Regex Base64Regex();

    /// <summary>Подпись: латиница, цифры, @ . _ - и пробелы — без кавычек и спецсимволов оболочки.</summary>
    [GeneratedRegex("^[A-Za-z0-9@._ -]*$")]
    private static partial Regex CommentRegex();
}
