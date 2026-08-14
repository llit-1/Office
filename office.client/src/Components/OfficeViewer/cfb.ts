/**
 * Читатель Compound File Binary (OLE2) — контейнер старых форматов Office (.doc, .xls, .ppt).
 * Реализовано только чтение потоков по имени, чего достаточно для превью.
 */

const SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const FREE_SECTOR = 0xffffffff;
const END_OF_CHAIN = 0xfffffffe;

interface DirectoryEntry {
  name: string;
  type: number;
  startSector: number;
  size: number;
}

export function isCompoundFile(bytes: Uint8Array) {
  if (bytes.length < 8) return false;
  return SIGNATURE.every((value, index) => bytes[index] === value);
}

export class CompoundFile {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly sectorSize: number;
  private readonly miniSectorSize: number;
  private readonly miniCutoff: number;
  private readonly fat: number[] = [];
  private readonly miniFat: number[] = [];
  private readonly directory: DirectoryEntry[] = [];
  private miniStream: Uint8Array = new Uint8Array(0);

  constructor(input: ArrayBuffer | Uint8Array) {
    this.bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!isCompoundFile(this.bytes)) throw new Error("Файл не является документом Office 97-2003.");
    this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);

    this.sectorSize = 1 << this.view.getUint16(0x1e, true);
    this.miniSectorSize = 1 << this.view.getUint16(0x20, true);
    this.miniCutoff = this.view.getUint32(0x38, true);

    this.readFat();
    this.readDirectory();
    this.readMiniFat();
  }

  /** Возвращает поток по имени (без учёта регистра), либо null. */
  readStream(name: string): Uint8Array | null {
    const target = name.toLowerCase();
    const entry = this.directory.find((item) => item.type === 2 && item.name.toLowerCase() === target);
    if (!entry) return null;
    return this.readEntry(entry);
  }

  streamNames() {
    return this.directory.filter((item) => item.type === 2).map((item) => item.name);
  }

  private sectorOffset(sector: number) {
    return (sector + 1) * this.sectorSize;
  }

  private readFat() {
    const difat: number[] = [];
    for (let index = 0; index < 109; index += 1) {
      const sector = this.view.getUint32(0x4c + index * 4, true);
      if (sector === FREE_SECTOR) break;
      difat.push(sector);
    }

    let difatSector = this.view.getUint32(0x44, true);
    const difatCount = this.view.getUint32(0x48, true);
    const perSector = this.sectorSize / 4 - 1;
    for (let index = 0; index < difatCount && difatSector !== END_OF_CHAIN && difatSector !== FREE_SECTOR; index += 1) {
      const base = this.sectorOffset(difatSector);
      if (base + this.sectorSize > this.bytes.length) break;
      for (let slot = 0; slot < perSector; slot += 1) {
        const sector = this.view.getUint32(base + slot * 4, true);
        if (sector === FREE_SECTOR) continue;
        difat.push(sector);
      }
      difatSector = this.view.getUint32(base + perSector * 4, true);
    }

    for (const sector of difat) {
      const base = this.sectorOffset(sector);
      if (base + this.sectorSize > this.bytes.length) break;
      for (let slot = 0; slot < this.sectorSize / 4; slot += 1) {
        this.fat.push(this.view.getUint32(base + slot * 4, true));
      }
    }
  }

  private chain(startSector: number): number[] {
    const sectors: number[] = [];
    let sector = startSector;
    const guard = this.fat.length + 1;
    while (sector !== END_OF_CHAIN && sector !== FREE_SECTOR && sectors.length < guard) {
      sectors.push(sector);
      sector = this.fat[sector] ?? END_OF_CHAIN;
    }
    return sectors;
  }

  private readChain(startSector: number, size: number): Uint8Array {
    const sectors = this.chain(startSector);
    const output = new Uint8Array(sectors.length * this.sectorSize);
    let written = 0;
    for (const sector of sectors) {
      const base = this.sectorOffset(sector);
      if (base + this.sectorSize > this.bytes.length) break;
      output.set(this.bytes.subarray(base, base + this.sectorSize), written);
      written += this.sectorSize;
    }
    return output.subarray(0, size > 0 ? Math.min(size, written) : written);
  }

  private readDirectory() {
    const firstDirSector = this.view.getUint32(0x30, true);
    const raw = this.readChain(firstDirSector, 0);
    const entrySize = 128;
    for (let offset = 0; offset + entrySize <= raw.length; offset += entrySize) {
      const nameLength = (raw[offset + 0x40] | (raw[offset + 0x41] << 8)) || 0;
      const type = raw[offset + 0x42];
      if (type === 0) continue;
      const chars: number[] = [];
      for (let index = 0; index + 1 < Math.max(0, nameLength - 2); index += 2) {
        chars.push(raw[offset + index] | (raw[offset + index + 1] << 8));
      }
      const startSector = raw[offset + 0x74] | (raw[offset + 0x75] << 8) | (raw[offset + 0x76] << 16) | (raw[offset + 0x77] << 24);
      const sizeLow = (raw[offset + 0x78] | (raw[offset + 0x79] << 8) | (raw[offset + 0x7a] << 16) | (raw[offset + 0x7b] << 24)) >>> 0;
      const sizeHigh = (raw[offset + 0x7c] | (raw[offset + 0x7d] << 8) | (raw[offset + 0x7e] << 16) | (raw[offset + 0x7f] << 24)) >>> 0;
      this.directory.push({
        name: String.fromCharCode(...chars),
        type,
        startSector: startSector >>> 0,
        size: sizeHigh * 4294967296 + sizeLow,
      });
    }
  }

  private readMiniFat() {
    const firstMiniFat = this.view.getUint32(0x3c, true);
    if (firstMiniFat !== END_OF_CHAIN && firstMiniFat !== FREE_SECTOR) {
      const raw = this.readChain(firstMiniFat, 0);
      const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      for (let offset = 0; offset + 4 <= raw.length; offset += 4) {
        this.miniFat.push(view.getUint32(offset, true));
      }
    }

    const root = this.directory.find((item) => item.type === 5);
    if (root && root.size > 0) {
      this.miniStream = this.readChain(root.startSector, root.size);
    }
  }

  private readEntry(entry: DirectoryEntry): Uint8Array {
    if (entry.size >= this.miniCutoff) return this.readChain(entry.startSector, entry.size);

    const output = new Uint8Array(entry.size);
    let written = 0;
    let sector = entry.startSector;
    const guard = this.miniFat.length + 1;
    let steps = 0;
    while (sector !== END_OF_CHAIN && sector !== FREE_SECTOR && written < entry.size && steps < guard) {
      const base = sector * this.miniSectorSize;
      const length = Math.min(this.miniSectorSize, entry.size - written);
      if (base + length > this.miniStream.length) break;
      output.set(this.miniStream.subarray(base, base + length), written);
      written += length;
      sector = this.miniFat[sector] ?? END_OF_CHAIN;
      steps += 1;
    }
    return output.subarray(0, written);
  }
}
