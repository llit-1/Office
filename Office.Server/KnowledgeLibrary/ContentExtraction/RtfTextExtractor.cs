using System.Text;
using System.Text.RegularExpressions;

namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>
/// Грубый, но достаточный для поиска извлекатель текста из RTF: убирает управляющие слова,
/// таблицы шрифтов/цветов и прочие служебные группы, разбирает \'hh (байт в кодировке документа)
/// и \uNNNN (юникод-эскейп). Не претендует на полное соответствие спецификации RTF —
/// нужен только читаемый текст для индексации, не форматирование.
/// </summary>
public static partial class RtfTextExtractor
{
    [GeneratedRegex(@"\\ansicpg(\d+)")]
    private static partial Regex AnsiCodePageRegex();

    /// <summary>Группы, чьё содержимое — служебные данные, не видимый текст.</summary>
    private static readonly HashSet<string> SkipDestinations = new(StringComparer.OrdinalIgnoreCase)
    {
        "fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "objdata",
        "header", "footer", "headerf", "footerf", "footnote", "generator",
        "themedata", "colorschememapping", "latentstyles", "rsidtbl", "listtable",
        "listoverridetable", "revtbl", "xmlnstbl", "datastore", "fchars", "lchars",
        "nonshppict", "shppict", "bkmkstart", "bkmkend",
    };

    public static async Task<string?> ExtractAsync(string fullPath, CancellationToken cancellationToken)
    {
        var bytes = await File.ReadAllBytesAsync(fullPath, cancellationToken);
        return Extract(bytes);
    }

    public static string? Extract(byte[] bytes)
    {
        if (bytes.Length < 5) return null;

        var codePage = DetectCodePage(bytes);
        var text = new StringBuilder();
        var groupIsSkipped = new Stack<bool>();
        var currentSkip = false;
        var uSkipCount = 1;
        var pendingUSkip = 0;

        var i = 0;
        while (i < bytes.Length)
        {
            var b = bytes[i];
            if (b == (byte)'{')
            {
                groupIsSkipped.Push(currentSkip);
                i++;
                continue;
            }
            if (b == (byte)'}')
            {
                if (groupIsSkipped.Count > 0) currentSkip = groupIsSkipped.Pop();
                i++;
                continue;
            }
            if (b == (byte)'\\')
            {
                i++;
                if (i >= bytes.Length) break;
                var c = (char)bytes[i];

                // \'hh — байт в кодировке документа.
                if (c == '\'' && i + 2 < bytes.Length)
                {
                    var hex = Encoding.ASCII.GetString(bytes, i + 1, 2);
                    if (int.TryParse(hex, System.Globalization.NumberStyles.HexNumber, null, out var value))
                    {
                        if (pendingUSkip > 0) { pendingUSkip--; }
                        else if (!currentSkip) text.Append(codePage.GetChars([(byte)value]));
                    }
                    i += 3;
                    continue;
                }

                // \* — маркер "необязательного назначения": если читалка его не понимает, всю
                // группу нужно пропустить целиком. Сам по себе control SYMBOL, не control WORD,
                // поэтому не может попасть в switch(word) ниже — обрабатываем отдельно.
                if (c == '*')
                {
                    currentSkip = true;
                    i++;
                    continue;
                }

                // Управляющее слово: буквы + необязательный числовой параметр + один разделитель-пробел.
                if (char.IsLetter(c))
                {
                    var start = i;
                    while (i < bytes.Length && char.IsLetter((char)bytes[i])) i++;
                    var word = Encoding.ASCII.GetString(bytes, start, i - start);
                    var paramStart = i;
                    var negative = i < bytes.Length && bytes[i] == (byte)'-';
                    if (negative) i++;
                    while (i < bytes.Length && bytes[i] is >= (byte)'0' and <= (byte)'9') i++;
                    var hasParam = i > paramStart + (negative ? 1 : 0);
                    var paramValue = hasParam && int.TryParse(Encoding.ASCII.GetString(bytes, paramStart, i - paramStart), out var p) ? p : (int?)null;
                    if (i < bytes.Length && bytes[i] == (byte)' ') i++; // разделитель после управляющего слова

                    switch (word)
                    {
                        case "u" when paramValue is not null:
                            if (!currentSkip) text.Append((char)(paramValue.Value < 0 ? paramValue.Value + 65536 : paramValue.Value));
                            pendingUSkip = uSkipCount;
                            break;
                        case "uc" when paramValue is not null:
                            uSkipCount = paramValue.Value;
                            break;
                        case "par" or "line" or "row" or "cell" or "tab":
                            if (!currentSkip) text.Append(' ');
                            break;
                        default:
                            if (SkipDestinations.Contains(word)) currentSkip = true;
                            break;
                    }
                    continue;
                }

                // Экранированные спецсимволы: \\ \{ \}
                if (c is '\\' or '{' or '}')
                {
                    if (pendingUSkip > 0) pendingUSkip--;
                    else if (!currentSkip) text.Append(c);
                    i++;
                    continue;
                }

                // Неизвестная управляющая последовательность из одного символа — пропускаем.
                i++;
                continue;
            }

            if (b is (byte)'\r' or (byte)'\n')
            {
                i++;
                continue;
            }

            if (pendingUSkip > 0)
            {
                pendingUSkip--;
                i++;
                continue;
            }

            if (!currentSkip)
            {
                if (b < 0x80) text.Append((char)b);
                else text.Append(codePage.GetChars([b]));
            }
            i++;
        }

        var result = Regex.Replace(text.ToString(), @"\s+", " ").Trim();
        return result.Length == 0 ? null : result;
    }

    private static Encoding DetectCodePage(byte[] bytes)
    {
        var headSize = Math.Min(bytes.Length, 512);
        var head = Encoding.ASCII.GetString(bytes, 0, headSize);
        var match = AnsiCodePageRegex().Match(head);
        if (match.Success && int.TryParse(match.Groups[1].Value, out var codePage))
        {
            try { return Encoding.GetEncoding(codePage); }
            catch (Exception) { /* неизвестная кодовая страница — используем запасной вариант ниже */ }
        }
        // \ansicpg не найден или не распознан — для русскоязычной библиотеки разумнее по умолчанию
        // cp1251, чем спецификационный cp1252 (иначе кириллица в старых файлах превратится в мусор).
        return Encoding.GetEncoding(1251);
    }
}
