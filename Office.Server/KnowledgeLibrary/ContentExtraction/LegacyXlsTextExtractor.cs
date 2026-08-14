using System.Buffers.Binary;
using System.Text;

namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>
/// Извлечение текста из Excel 97-2003 (.xls) через BIFF8-записи. В отличие от office.client
/// (xlsLegacy.ts), нам не нужны позиции ячеек, числа, форматирование — только сами строки для
/// поиска, поэтому логика сильно уже: общий пул строк (SST) плюс прямые LABEL/RSTRING/STRING.
/// </summary>
public static class LegacyXlsTextExtractor
{
    private const int RecordEof = 0x000a;
    private const int RecordContinue = 0x003c;
    private const int RecordFilePass = 0x002f;
    private const int RecordBoundSheet = 0x0085;
    private const int RecordSst = 0x00fc;
    private const int RecordLabel = 0x0204;
    private const int RecordRString = 0x00d6;
    private const int RecordStringRec = 0x0207;

    public static string? Extract(byte[] fileBytes)
    {
        var cfb = new CompoundFileReader(fileBytes);
        var stream = cfb.ReadStream("Workbook") ?? cfb.ReadStream("Book");
        if (stream is null || stream.Length == 0) return null;

        var globals = ReadRecords(stream, 0);
        var texts = new List<string>();
        var sheetPositions = new List<int>();

        for (var i = 0; i < globals.Count; i++)
        {
            var record = globals[i];
            if (record.Type == RecordFilePass) return null; // защищено паролем — читать нечем
            if (record.Type == RecordEof) break;

            if (record.Type == RecordBoundSheet && record.Data.Length >= 4)
            {
                var position = BinaryPrimitives.ReadUInt32LittleEndian(record.Data.AsSpan(0, 4));
                if (position < stream.Length) sheetPositions.Add((int)position);
            }
            else if (record.Type == RecordSst)
            {
                var blocks = new List<byte[]> { record.Data };
                var cursor = i + 1;
                while (cursor < globals.Count && globals[cursor].Type == RecordContinue)
                {
                    blocks.Add(globals[cursor].Data);
                    cursor++;
                }

                var reader = new SharedStringReader(blocks);
                reader.ReadUInt32(); // общее число вхождений строк — не нужно
                var unique = reader.ReadUInt32();
                var limit = Math.Min(unique, 500_000u);
                for (var stringIndex = 0u; stringIndex < limit && !reader.Done; stringIndex++)
                    texts.Add(reader.ReadString());

                i = cursor - 1;
            }
        }

        foreach (var position in sheetPositions)
        {
            var records = ReadRecords(stream, position);
            foreach (var record in records)
            {
                if (record.Type == RecordEof) break;
                if ((record.Type == RecordLabel || record.Type == RecordRString) && record.Data.Length > 6)
                    texts.Add(ReadLongString(record.Data, 6));
                else if (record.Type == RecordStringRec && record.Data.Length > 0)
                    texts.Add(ReadLongString(record.Data, 0));
            }
        }

        var joined = string.Join(" ", texts.Where(x => !string.IsNullOrWhiteSpace(x)));
        return string.IsNullOrWhiteSpace(joined) ? null : joined;
    }

    private static List<RawRecord> ReadRecords(byte[] stream, int start)
    {
        var records = new List<RawRecord>();
        var offset = start;
        while (offset + 4 <= stream.Length)
        {
            var type = BinaryPrimitives.ReadUInt16LittleEndian(stream.AsSpan(offset, 2));
            var length = BinaryPrimitives.ReadUInt16LittleEndian(stream.AsSpan(offset + 2, 2));
            var dataStart = offset + 4;
            if (dataStart + length > stream.Length) break;
            records.Add(new RawRecord(type, stream.AsSpan(dataStart, length).ToArray()));
            offset = dataStart + length;
            if (type == RecordEof && records.Count > 1) break;
        }
        return records;
    }

    /// <summary>BIFF8 XLUnicodeString с длинным (2-байтовым) префиксом длины: LABEL/RSTRING/STRING.</summary>
    private static string ReadLongString(byte[] data, int offset)
    {
        if (offset + 3 > data.Length) return string.Empty;
        var cch = data[offset] | (data[offset + 1] << 8);
        var flags = data[offset + 2];
        var highByte = (flags & 0x01) != 0;
        var text = new StringBuilder(cch);
        var cursor = offset + 3;
        for (var index = 0; index < cch && cursor < data.Length; index++)
        {
            if (highByte)
            {
                if (cursor + 1 >= data.Length) break;
                text.Append((char)(data[cursor] | (data[cursor + 1] << 8)));
                cursor += 2;
            }
            else
            {
                text.Append(Windows1251.Decode(data[cursor]));
                cursor += 1;
            }
        }
        return text.ToString();
    }

    private readonly record struct RawRecord(int Type, byte[] Data);

    /// <summary>
    /// Чтение общего пула строк (SST) с корректной обработкой разрывов на CONTINUE-записях —
    /// одна строка может быть "разрезана" границей записи прямо посередине символа.
    /// </summary>
    private sealed class SharedStringReader(List<byte[]> blocks)
    {
        private int _blockIndex;
        private int _offset;

        private bool Ensure()
        {
            while (_blockIndex < blocks.Count && _offset >= blocks[_blockIndex].Length)
            {
                _blockIndex++;
                _offset = 0;
            }
            return _blockIndex < blocks.Count;
        }

        private bool AtBlockEnd() => _blockIndex < blocks.Count && _offset >= blocks[_blockIndex].Length;

        public bool Done => !Ensure();

        private byte ReadByte()
        {
            if (!Ensure()) return 0;
            return blocks[_blockIndex][_offset++];
        }

        private int ReadUInt16() => ReadByte() | (ReadByte() << 8);

        public uint ReadUInt32() => (uint)(ReadByte() | (ReadByte() << 8) | (ReadByte() << 16) | (ReadByte() << 24));

        private void Skip(int count)
        {
            var left = count;
            while (left > 0 && Ensure())
            {
                var available = blocks[_blockIndex].Length - _offset;
                var step = Math.Min(available, left);
                _offset += step;
                left -= step;
            }
        }

        public string ReadString()
        {
            var cch = ReadUInt16();
            var flags = ReadByte();
            var highByte = (flags & 0x01) != 0;
            var rich = (flags & 0x08) != 0;
            var ext = (flags & 0x04) != 0;
            var runCount = rich ? ReadUInt16() : 0;
            var extSize = ext ? ReadUInt32() : 0;

            var text = new StringBuilder(cch);
            for (var index = 0; index < cch; index++)
            {
                if (AtBlockEnd())
                {
                    Ensure();
                    if (Done) break;
                    // На новом CONTINUE-блоке флаг сжатия снова записан первым байтом.
                    flags = ReadByte();
                    highByte = (flags & 0x01) != 0;
                }
                text.Append(highByte ? (char)ReadUInt16() : Windows1251.Decode(ReadByte()));
            }

            if (runCount > 0) Skip(runCount * 4);
            if (extSize > 0) Skip((int)extSize);
            return text.ToString();
        }
    }
}
