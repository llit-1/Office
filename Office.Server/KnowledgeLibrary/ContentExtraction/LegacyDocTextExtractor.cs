using System.Buffers.Binary;
using System.Text;

namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>
/// Извлечение текста из Word 97-2003 (.doc) через таблицу кусков (piece table) — та же схема,
/// что в office.client (docLegacy.ts), но сильно проще: не восстанавливаем таблицы/абзацы для
/// показа, просто разворачиваем куски текста в одну строку для поиска.
///
/// Важное отличие и исправление по сравнению с TS-версией: "сжатые" (compressed, однобайтовые)
/// прогоны текста декодировались там как CP1252 только в диапазоне 0x80-0x9F, а 0xA0-0xFF — как
/// Latin-1 напрямую. Для кириллических документов (Windows-1251) это даёт мусор вместо букв —
/// здесь используется полноценная Windows-1251 (актуально для большинства .doc в этой библиотеке).
/// </summary>
public static class LegacyDocTextExtractor
{
    public static string? Extract(byte[] fileBytes)
    {
        var cfb = new CompoundFileReader(fileBytes);
        var wordDocument = cfb.ReadStream("WordDocument");
        if (wordDocument is null || wordDocument.Length < 160) return null;

        var identifier = BinaryPrimitives.ReadUInt16LittleEndian(wordDocument.AsSpan(0, 2));
        if (identifier != 0xa5ec) return null; // не документ Word

        var nFib = BinaryPrimitives.ReadUInt16LittleEndian(wordDocument.AsSpan(2, 2));
        if (nFib < 193) return null; // Word 6.0/95 — не поддерживаем

        var flags = BinaryPrimitives.ReadUInt16LittleEndian(wordDocument.AsSpan(10, 2));
        if ((flags & 0x0100) != 0) return null; // защищён паролем

        var tableStreamName = (flags & 0x0200) != 0 ? "1Table" : "0Table";
        var table = cfb.ReadStream(tableStreamName);
        if (table is null) return null;

        var csw = BinaryPrimitives.ReadUInt16LittleEndian(wordDocument.AsSpan(32, 2));
        var cslwOffset = 34 + csw * 2;
        if (cslwOffset + 2 > wordDocument.Length) return null;
        var cslw = BinaryPrimitives.ReadUInt16LittleEndian(wordDocument.AsSpan(cslwOffset, 2));
        var fibRgLwOffset = cslwOffset + 2;
        if (fibRgLwOffset + 16 > wordDocument.Length) return null;
        var ccpText = BinaryPrimitives.ReadUInt32LittleEndian(wordDocument.AsSpan(fibRgLwOffset + 12, 4));
        var fibRgFcLcbOffset = fibRgLwOffset + cslw * 4 + 2;

        var clxOffset = fibRgFcLcbOffset + 33 * 8;
        if (clxOffset + 8 > wordDocument.Length) return null;
        var fcClx = BinaryPrimitives.ReadUInt32LittleEndian(wordDocument.AsSpan(clxOffset, 4));
        var lcbClx = BinaryPrimitives.ReadUInt32LittleEndian(wordDocument.AsSpan(clxOffset + 4, 4));
        if (lcbClx == 0 || fcClx + lcbClx > table.Length) return null;

        var clx = table.AsSpan((int)fcClx, (int)lcbClx);

        // Пропускаем блоки Prc (0x01), ищем Pcdt (0x02) — таблицу кусков.
        var cursor = 0;
        byte[]? plcPcd = null;
        while (cursor < clx.Length)
        {
            var marker = clx[cursor];
            if (marker == 0x01)
            {
                if (cursor + 3 > clx.Length) break;
                var size = BinaryPrimitives.ReadUInt16LittleEndian(clx.Slice(cursor + 1, 2));
                cursor += 3 + size;
            }
            else if (marker == 0x02)
            {
                if (cursor + 5 > clx.Length) break;
                var size = BinaryPrimitives.ReadUInt32LittleEndian(clx.Slice(cursor + 1, 4));
                var start = cursor + 5;
                var end = Math.Min(clx.Length, start + (int)size);
                plcPcd = clx[start..end].ToArray();
                break;
            }
            else break;
        }
        if (plcPcd is null || plcPcd.Length < 4) return null;

        var pieceCount = (plcPcd.Length - 4) / 12;
        if (pieceCount <= 0) return null;

        var raw = new StringBuilder();
        for (var index = 0; index < pieceCount; index++)
        {
            var cpStart = BinaryPrimitives.ReadUInt32LittleEndian(plcPcd.AsSpan(index * 4, 4));
            var cpEnd = BinaryPrimitives.ReadUInt32LittleEndian(plcPcd.AsSpan((index + 1) * 4, 4));
            var descriptorOffset = (pieceCount + 1) * 4 + index * 8;
            if (descriptorOffset + 6 > plcPcd.Length) continue;
            var fcValue = BinaryPrimitives.ReadUInt32LittleEndian(plcPcd.AsSpan(descriptorOffset + 2, 4));
            var compressed = (fcValue & 0x40000000) != 0;
            var fc = compressed ? (fcValue & 0x3fffffff) / 2 : fcValue & 0x3fffffff;
            var characters = (long)cpEnd - cpStart;
            if (characters <= 0) continue;

            var byteLength = compressed ? characters : characters * 2;
            var start = (long)fc;
            if (start + byteLength > wordDocument.Length) continue;
            var slice = wordDocument.AsSpan((int)start, (int)byteLength);
            raw.Append(compressed ? DecodeCompressed(slice) : DecodeUtf16(slice));
        }

        var mainTextSpan = raw.ToString();
        var mainText = ccpText > 0 && ccpText < mainTextSpan.Length ? mainTextSpan[..(int)ccpText] : mainTextSpan;

        var output = new StringBuilder(mainText.Length);
        var inField = false;
        foreach (var ch in mainText)
        {
            var code = (int)ch;
            if (code == 0x13) { inField = true; continue; }
            if (code == 0x14 || code == 0x15) { inField = false; continue; }
            if (inField) continue;

            switch (code)
            {
                case 0x07: // конец ячейки/строки таблицы
                case 0x0d: // конец абзаца
                case 0x0c: // разрыв страницы
                case 0x0e: // разрыв колонки
                case 0x0b: // мягкий перенос строки
                    output.Append(' ');
                    continue;
                case 0x1e:
                    output.Append('-');
                    continue;
                case 0x1f:
                    continue;
            }
            if (code < 0x20 && code != 0x09) continue;

            output.Append((char)code);
        }

        var result = System.Text.RegularExpressions.Regex.Replace(output.ToString(), @"\s+", " ").Trim();
        return result.Length == 0 ? null : result;
    }

    private static string DecodeCompressed(ReadOnlySpan<byte> bytes)
    {
        var chars = new char[bytes.Length];
        for (var i = 0; i < bytes.Length; i++)
            chars[i] = Windows1251.Decode(bytes[i]);
        return new string(chars);
    }

    private static string DecodeUtf16(ReadOnlySpan<byte> bytes)
    {
        var length = bytes.Length / 2;
        var chars = new char[length];
        for (var i = 0; i < length; i++)
            chars[i] = (char)BinaryPrimitives.ReadUInt16LittleEndian(bytes.Slice(i * 2, 2));
        return new string(chars);
    }
}
