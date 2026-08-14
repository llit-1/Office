/**
 * Минимальный ZIP-ридер на нативных API браузера.
 * Используется для чтения OOXML-контейнеров (.docx / .xlsx) без внешних зависимостей.
 * Разжатие выполняется через DecompressionStream("deflate-raw").
 */

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const EOCD64_LOCATOR_SIGNATURE = 0x07064b50;
const EOCD64_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;

export function isDeflateSupported() {
  return typeof DecompressionStream !== "undefined";
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (!isDeflateSupported()) {
    throw new Error("Браузер не поддерживает распаковку файлов. Обновите браузер или скачайте файл.");
  }
  const stream = new Blob([data as unknown as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

export class ZipArchive {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly entries = new Map<string, ZipEntry>();

  private constructor(bytes: Uint8Array) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  static open(buffer: ArrayBuffer | Uint8Array): ZipArchive {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const archive = new ZipArchive(bytes);
    archive.readCentralDirectory();
    return archive;
  }

  has(name: string) {
    return this.entries.has(name);
  }

  names() {
    return [...this.entries.keys()];
  }

  async readBytes(name: string): Promise<Uint8Array | null> {
    const entry = this.entries.get(name);
    if (!entry) return null;

    const headerOffset = entry.localHeaderOffset;
    if (this.view.getUint32(headerOffset, true) !== 0x04034b50) return null;
    const nameLength = this.view.getUint16(headerOffset + 26, true);
    const extraLength = this.view.getUint16(headerOffset + 28, true);
    const dataStart = headerOffset + 30 + nameLength + extraLength;
    const raw = this.bytes.subarray(dataStart, dataStart + entry.compressedSize);

    if (entry.method === 0) return raw.slice();
    if (entry.method === 8) return await inflateRaw(raw);
    throw new Error(`Неподдерживаемый метод сжатия ZIP (${entry.method}).`);
  }

  async readText(name: string): Promise<string | null> {
    const bytes = await this.readBytes(name);
    if (!bytes) return null;
    return new TextDecoder("utf-8").decode(bytes);
  }

  async readXml(name: string): Promise<Document | null> {
    const text = await this.readText(name);
    if (text === null) return null;
    const doc = new DOMParser().parseFromString(text, "application/xml");
    if (doc.getElementsByTagName("parsererror").length > 0) return null;
    return doc;
  }

  private findEocd(): number {
    const maxComment = 0xffff;
    const start = Math.max(0, this.bytes.length - maxComment - 22);
    for (let offset = this.bytes.length - 22; offset >= start; offset -= 1) {
      if (this.view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
    }
    throw new Error("Файл повреждён: не найдена структура ZIP.");
  }

  private readCentralDirectory() {
    const eocd = this.findEocd();
    let entryCount = this.view.getUint16(eocd + 10, true);
    let directoryOffset = this.view.getUint32(eocd + 16, true);

    // ZIP64
    if (entryCount === 0xffff || directoryOffset === 0xffffffff) {
      const locator = eocd - 20;
      if (locator >= 0 && this.view.getUint32(locator, true) === EOCD64_LOCATOR_SIGNATURE) {
        const eocd64 = Number(this.view.getBigUint64(locator + 8, true));
        if (this.view.getUint32(eocd64, true) === EOCD64_SIGNATURE) {
          entryCount = Number(this.view.getBigUint64(eocd64 + 32, true));
          directoryOffset = Number(this.view.getBigUint64(eocd64 + 48, true));
        }
      }
    }

    let offset = directoryOffset;
    const decoder = new TextDecoder("utf-8");
    for (let index = 0; index < entryCount; index += 1) {
      if (offset + 46 > this.bytes.length) break;
      if (this.view.getUint32(offset, true) !== CENTRAL_SIGNATURE) break;

      const method = this.view.getUint16(offset + 10, true);
      let compressedSize = this.view.getUint32(offset + 20, true);
      let uncompressedSize = this.view.getUint32(offset + 24, true);
      const nameLength = this.view.getUint16(offset + 28, true);
      const extraLength = this.view.getUint16(offset + 30, true);
      const commentLength = this.view.getUint16(offset + 32, true);
      let localHeaderOffset = this.view.getUint32(offset + 42, true);
      const name = decoder.decode(this.bytes.subarray(offset + 46, offset + 46 + nameLength));

      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
        let extraOffset = offset + 46 + nameLength;
        const extraEnd = extraOffset + extraLength;
        while (extraOffset + 4 <= extraEnd) {
          const headerId = this.view.getUint16(extraOffset, true);
          const size = this.view.getUint16(extraOffset + 2, true);
          if (headerId === 0x0001) {
            let cursor = extraOffset + 4;
            if (uncompressedSize === 0xffffffff) { uncompressedSize = Number(this.view.getBigUint64(cursor, true)); cursor += 8; }
            if (compressedSize === 0xffffffff) { compressedSize = Number(this.view.getBigUint64(cursor, true)); cursor += 8; }
            if (localHeaderOffset === 0xffffffff) { localHeaderOffset = Number(this.view.getBigUint64(cursor, true)); }
            break;
          }
          extraOffset += 4 + size;
        }
      }

      this.entries.set(name, { name, method, compressedSize, uncompressedSize, localHeaderOffset });
      offset += 46 + nameLength + extraLength + commentLength;
    }
  }
}
