using System.Text;
using System.Text.RegularExpressions;

namespace Office.Server.Stock;

/// <summary>
/// Код RFID-метки объекта склада: 24 шестнадцатеричных символа. Короткий код дополняется нулями слева,
/// как это делал старый портал.
/// </summary>
public static partial class StockObjectCode
{
    public const int Length = 24;

    // Сканер работает как клавиатура: в русской раскладке буквы A–F приходят как Ф, И, С, В, У, А.
    private static readonly Dictionary<char, char> RussianLayout = new()
    {
        ['Ф'] = 'A', ['И'] = 'B', ['С'] = 'C', ['В'] = 'D', ['У'] = 'E', ['А'] = 'F',
        ['ф'] = 'A', ['и'] = 'B', ['с'] = 'C', ['в'] = 'D', ['у'] = 'E', ['а'] = 'F',
    };

    public static bool TryNormalize(string? raw, out string code)
    {
        code = string.Empty;
        if (string.IsNullOrWhiteSpace(raw))
        {
            return false;
        }

        var builder = new StringBuilder(Length);
        foreach (var symbol in raw)
        {
            if (char.IsWhiteSpace(symbol))
            {
                continue;
            }

            builder.Append(char.ToUpperInvariant(RussianLayout.GetValueOrDefault(symbol, symbol)));
        }

        var value = builder.ToString();
        if (value.Length is 0 or > Length || !HexPattern().IsMatch(value))
        {
            return false;
        }

        code = value.PadLeft(Length, '0');
        return true;
    }

    [GeneratedRegex("^[0-9A-F]+$")]
    private static partial Regex HexPattern();
}
