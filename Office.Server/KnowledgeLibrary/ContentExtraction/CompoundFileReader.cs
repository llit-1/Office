using System.Buffers.Binary;

namespace Office.Server.KnowledgeLibrary.ContentExtraction;

/// <summary>
/// Минимальный читатель Compound File Binary (OLE2) — контейнер старых форматов Office (.doc, .xls).
/// Умеет только читать потоки по имени, этого достаточно для извлечения текста при индексации.
/// Порт логики из office.client/src/Components/OfficeViewer/cfb.ts (уже проверенной в вьюере),
/// один в один по структуре, чтобы не потерять нюансы формата при переносе.
/// </summary>
public sealed class CompoundFileReader
{
    private static readonly byte[] Signature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
    private const uint FreeSector = 0xFFFFFFFF;
    private const uint EndOfChain = 0xFFFFFFFE;

    private readonly byte[] _bytes;
    private readonly int _sectorSize;
    private readonly int _miniSectorSize;
    private readonly uint _miniCutoff;
    private readonly List<uint> _fat = [];
    private readonly List<uint> _miniFat = [];
    private readonly List<DirectoryEntry> _directory = [];
    private byte[] _miniStream = [];

    public static bool IsCompoundFile(ReadOnlySpan<byte> bytes)
    {
        if (bytes.Length < 8) return false;
        for (var i = 0; i < Signature.Length; i++)
            if (bytes[i] != Signature[i]) return false;
        return true;
    }

    public CompoundFileReader(byte[] bytes)
    {
        _bytes = bytes;
        if (!IsCompoundFile(_bytes))
            throw new InvalidDataException("Файл не является документом Office 97-2003 (нет CFB-сигнатуры).");

        _sectorSize = 1 << ReadUInt16(0x1e);
        _miniSectorSize = 1 << ReadUInt16(0x20);
        _miniCutoff = ReadUInt32(0x38);

        ReadFat();
        ReadDirectory();
        ReadMiniFat();
    }

    /// <summary>Возвращает поток по имени (без учёта регистра), либо null.</summary>
    public byte[]? ReadStream(string name)
    {
        var entry = _directory.FirstOrDefault(x => x.Type == 2 && string.Equals(x.Name, name, StringComparison.OrdinalIgnoreCase));
        return entry is null ? null : ReadEntry(entry);
    }

    private ushort ReadUInt16(int offset) => BinaryPrimitives.ReadUInt16LittleEndian(_bytes.AsSpan(offset, 2));
    private uint ReadUInt32(int offset) => BinaryPrimitives.ReadUInt32LittleEndian(_bytes.AsSpan(offset, 4));

    private long SectorOffset(uint sector) => (sector + 1L) * _sectorSize;

    private void ReadFat()
    {
        var difat = new List<uint>();
        for (var index = 0; index < 109; index++)
        {
            var sector = ReadUInt32(0x4c + index * 4);
            if (sector == FreeSector) break;
            difat.Add(sector);
        }

        var difatSector = ReadUInt32(0x44);
        var difatCount = ReadUInt32(0x48);
        var perSector = _sectorSize / 4 - 1;
        for (var index = 0; index < difatCount && difatSector != EndOfChain && difatSector != FreeSector; index++)
        {
            var baseOffset = SectorOffset(difatSector);
            if (baseOffset + _sectorSize > _bytes.Length) break;
            for (var slot = 0; slot < perSector; slot++)
            {
                var sector = ReadUInt32((int)(baseOffset + slot * 4));
                if (sector == FreeSector) continue;
                difat.Add(sector);
            }
            difatSector = ReadUInt32((int)(baseOffset + perSector * 4));
        }

        foreach (var sector in difat)
        {
            var baseOffset = SectorOffset(sector);
            if (baseOffset + _sectorSize > _bytes.Length) break;
            for (var slot = 0; slot < _sectorSize / 4; slot++)
                _fat.Add(ReadUInt32((int)(baseOffset + slot * 4)));
        }
    }

    private List<uint> Chain(uint startSector)
    {
        var sectors = new List<uint>();
        var sector = startSector;
        var guard = _fat.Count + 1;
        while (sector != EndOfChain && sector != FreeSector && sectors.Count < guard)
        {
            sectors.Add(sector);
            sector = sector < _fat.Count ? _fat[(int)sector] : EndOfChain;
        }
        return sectors;
    }

    /// <summary>size &lt;= 0 означает «прочитать всю цепочку целиком».</summary>
    private byte[] ReadChain(uint startSector, long size)
    {
        var sectors = Chain(startSector);
        var output = new byte[(long)sectors.Count * _sectorSize];
        var written = 0;
        foreach (var sector in sectors)
        {
            var baseOffset = SectorOffset(sector);
            if (baseOffset + _sectorSize > _bytes.Length) break;
            Buffer.BlockCopy(_bytes, (int)baseOffset, output, written, _sectorSize);
            written += _sectorSize;
        }
        var length = size > 0 ? (int)Math.Min(size, written) : written;
        return output.AsSpan(0, length).ToArray();
    }

    private void ReadDirectory()
    {
        var firstDirSector = ReadUInt32(0x30);
        var raw = ReadChain(firstDirSector, 0);
        const int entrySize = 128;
        for (var offset = 0; offset + entrySize <= raw.Length; offset += entrySize)
        {
            var nameLength = raw[offset + 0x40] | (raw[offset + 0x41] << 8);
            var type = raw[offset + 0x42];
            if (type == 0) continue;

            var charCount = Math.Max(0, (nameLength - 2) / 2);
            var chars = new char[charCount];
            for (var i = 0; i < charCount; i++)
            {
                var byteOffset = offset + i * 2;
                chars[i] = (char)(raw[byteOffset] | (raw[byteOffset + 1] << 8));
            }

            var startSector = (uint)(raw[offset + 0x74] | (raw[offset + 0x75] << 8) | (raw[offset + 0x76] << 16) | (raw[offset + 0x77] << 24));
            var sizeLow = (uint)(raw[offset + 0x78] | (raw[offset + 0x79] << 8) | (raw[offset + 0x7a] << 16) | (raw[offset + 0x7b] << 24));
            var sizeHigh = (uint)(raw[offset + 0x7c] | (raw[offset + 0x7d] << 8) | (raw[offset + 0x7e] << 16) | (raw[offset + 0x7f] << 24));

            _directory.Add(new DirectoryEntry(new string(chars), type, startSector, sizeHigh * 4294967296L + sizeLow));
        }
    }

    private void ReadMiniFat()
    {
        var firstMiniFat = ReadUInt32(0x3c);
        if (firstMiniFat != EndOfChain && firstMiniFat != FreeSector)
        {
            var raw = ReadChain(firstMiniFat, 0);
            for (var offset = 0; offset + 4 <= raw.Length; offset += 4)
                _miniFat.Add(BinaryPrimitives.ReadUInt32LittleEndian(raw.AsSpan(offset, 4)));
        }

        var root = _directory.FirstOrDefault(x => x.Type == 5);
        if (root is not null && root.Size > 0)
            _miniStream = ReadChain(root.StartSector, root.Size);
    }

    private byte[] ReadEntry(DirectoryEntry entry)
    {
        if (entry.Size >= _miniCutoff)
            return ReadChain(entry.StartSector, entry.Size);

        var output = new byte[entry.Size];
        var written = 0L;
        var sector = entry.StartSector;
        var guard = _miniFat.Count + 1;
        var steps = 0;
        while (sector != EndOfChain && sector != FreeSector && written < entry.Size && steps < guard)
        {
            var baseOffset = (long)sector * _miniSectorSize;
            var length = Math.Min(_miniSectorSize, entry.Size - written);
            if (baseOffset + length > _miniStream.Length) break;
            Buffer.BlockCopy(_miniStream, (int)baseOffset, output, (int)written, (int)length);
            written += length;
            sector = sector < _miniFat.Count ? _miniFat[(int)sector] : EndOfChain;
            steps++;
        }
        return output.AsSpan(0, (int)written).ToArray();
    }

    private sealed record DirectoryEntry(string Name, byte Type, uint StartSector, long Size);
}
