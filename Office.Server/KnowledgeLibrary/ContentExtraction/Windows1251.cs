using System.Text;

namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>
/// Кодировка Windows-1251 недоступна в .NET Core без явной регистрации CodePagesEncodingProvider
/// (пакет System.Text.Encoding.CodePages). Нужна в двух местах: legacy .doc/.xls хранят однобайтовые
/// "compressed" текстовые прогоны в кодировке документа (для русских файлов почти всегда cp1251,
/// это не то же самое, что Latin-1/CP1252 — путать нельзя, иначе кириллица превращается в мусор),
/// и .txt/.csv/.md без BOM, где нет иного способа понять кодировку, кроме эвристики.
/// </summary>
public static class Windows1251
{
    private static readonly Encoding CodePage;

    /// <summary>Таблица байт-в-символ 0..255 для быстрого посимвольного декодирования.</summary>
    public static readonly char[] Chars;

    static Windows1251()
    {
        Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        CodePage = Encoding.GetEncoding(1251);
        var bytes = new byte[256];
        for (var i = 0; i < 256; i++) bytes[i] = (byte)i;
        Chars = CodePage.GetChars(bytes);
    }

    public static char Decode(byte value) => Chars[value];

    public static string Decode(ReadOnlySpan<byte> bytes) => CodePage.GetString(bytes);
}
