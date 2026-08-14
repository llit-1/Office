import { CompoundFile } from "./cfb";
import { decodeRk, formatNumber, resolveFormatCode } from "./numberFormat";
import type { SheetCell, SheetData, WorkbookData } from "./officeViewer.types";
import { MAX_PREVIEW_COLUMNS, MAX_PREVIEW_ROWS } from "./xlsx";

const RECORD = {
  FORMULA: 0x0006,
  EOF: 0x000a,
  BLANK: 0x0201,
  NUMBER: 0x0203,
  LABEL: 0x0204,
  BOOLERR: 0x0205,
  STRING: 0x0207,
  BOF: 0x0809,
  CONTINUE: 0x003c,
  DATEMODE: 0x0022,
  FILEPASS: 0x002f,
  BOUNDSHEET: 0x0085,
  MULRK: 0x00bd,
  MULBLANK: 0x00be,
  RK: 0x027e,
  XF: 0x00e0,
  FORMAT: 0x041e,
  SST: 0x00fc,
  LABELSST: 0x00fd,
  RSTRING: 0x00d6,
} as const;

interface RawRecord {
  type: number;
  offset: number;
  data: Uint8Array;
}

function readRecords(stream: Uint8Array, start: number): RawRecord[] {
  const records: RawRecord[] = [];
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  let offset = start;
  while (offset + 4 <= stream.length) {
    const type = view.getUint16(offset, true);
    const length = view.getUint16(offset + 2, true);
    const dataStart = offset + 4;
    if (dataStart + length > stream.length) break;
    records.push({ type, offset, data: stream.subarray(dataStart, dataStart + length) });
    offset = dataStart + length;
    if (type === RECORD.EOF && records.length > 1) break;
  }
  return records;
}

/** Чтение SST с корректной обработкой разрывов на CONTINUE. */
class SharedStringReader {
  private blockIndex = 0;
  private offset = 0;

  constructor(private readonly blocks: Uint8Array[]) {}

  private ensure() {
    while (this.blockIndex < this.blocks.length && this.offset >= this.blocks[this.blockIndex].length) {
      this.blockIndex += 1;
      this.offset = 0;
    }
    return this.blockIndex < this.blocks.length;
  }

  /** true, если следующий байт лежит уже в новом блоке (нужно перечитать флаг). */
  private atBlockEnd() {
    return this.blockIndex < this.blocks.length && this.offset >= this.blocks[this.blockIndex].length;
  }

  byte(): number {
    if (!this.ensure()) return 0;
    return this.blocks[this.blockIndex][this.offset++];
  }

  u16(): number {
    return this.byte() | (this.byte() << 8);
  }

  u32(): number {
    return (this.byte() | (this.byte() << 8) | (this.byte() << 16) | (this.byte() << 24)) >>> 0;
  }

  skip(count: number) {
    let left = count;
    while (left > 0 && this.ensure()) {
      const available = this.blocks[this.blockIndex].length - this.offset;
      const step = Math.min(available, left);
      this.offset += step;
      left -= step;
    }
  }

  done() {
    return !this.ensure();
  }

  readString(): string {
    const cch = this.u16();
    let flags = this.byte();
    let highByte = (flags & 0x01) !== 0;
    const rich = (flags & 0x08) !== 0;
    const ext = (flags & 0x04) !== 0;
    const runCount = rich ? this.u16() : 0;
    const extSize = ext ? this.u32() : 0;

    let text = "";
    for (let index = 0; index < cch; index += 1) {
      if (this.atBlockEnd()) {
        this.ensure();
        if (this.done()) break;
        flags = this.byte();
        highByte = (flags & 0x01) !== 0;
      }
      text += String.fromCharCode(highByte ? this.u16() : this.byte());
    }

    if (runCount) this.skip(runCount * 4);
    if (extSize) this.skip(extSize);
    return text;
  }
}

function readShortString(data: Uint8Array, offset: number): { text: string; next: number } {
  const cch = data[offset];
  const flags = data[offset + 1];
  const highByte = (flags & 0x01) !== 0;
  let text = "";
  let cursor = offset + 2;
  for (let index = 0; index < cch; index += 1) {
    if (highByte) {
      text += String.fromCharCode(data[cursor] | (data[cursor + 1] << 8));
      cursor += 2;
    } else {
      text += String.fromCharCode(data[cursor]);
      cursor += 1;
    }
  }
  return { text, next: cursor };
}

function readLongString(data: Uint8Array, offset: number): string {
  const cch = data[offset] | (data[offset + 1] << 8);
  const flags = data[offset + 2];
  const highByte = (flags & 0x01) !== 0;
  let text = "";
  let cursor = offset + 3;
  for (let index = 0; index < cch && cursor < data.length; index += 1) {
    if (highByte) {
      text += String.fromCharCode(data[cursor] | (data[cursor + 1] << 8));
      cursor += 2;
    } else {
      text += String.fromCharCode(data[cursor]);
      cursor += 1;
    }
  }
  return text;
}

function setCell(rows: SheetCell[][], row: number, column: number, cell: SheetCell) {
  if (row >= MAX_PREVIEW_ROWS || column >= MAX_PREVIEW_COLUMNS) return false;
  while (rows.length <= row) rows.push([]);
  const target = rows[row];
  while (target.length <= column) target.push({ text: "" });
  target[column] = cell;
  return true;
}

export function readXls(buffer: ArrayBuffer): WorkbookData {
  const container = new CompoundFile(buffer);
  const stream = container.readStream("Workbook") ?? container.readStream("Book");
  if (!stream) throw new Error("Не удалось найти данные книги в файле .xls.");

  const globals = readRecords(stream, 0);
  const bofVersion = globals[0]?.type === RECORD.BOF && globals[0].data.length >= 2
    ? globals[0].data[0] | (globals[0].data[1] << 8)
    : 0;
  if (bofVersion && bofVersion < 0x0600) {
    throw new Error("Формат Excel 5.0/95 не поддерживается для просмотра. Скачайте файл.");
  }

  const boundSheets: { name: string; position: number; hidden: boolean }[] = [];
  const customFormats = new Map<number, string>();
  const xfFormats: number[] = [];
  let date1904 = false;
  let sharedStrings: string[] = [];

  for (let index = 0; index < globals.length; index += 1) {
    const record = globals[index];
    if (record.type === RECORD.FILEPASS) {
      throw new Error("Файл защищён паролем — предпросмотр недоступен.");
    }
    if (record.type === RECORD.EOF) break;

    if (record.type === RECORD.BOUNDSHEET) {
      const view = new DataView(record.data.buffer, record.data.byteOffset, record.data.byteLength);
      const position = view.getUint32(0, true);
      const hidden = (record.data[4] & 0x03) !== 0;
      const { text } = readShortString(record.data, 6);
      boundSheets.push({ name: text, position, hidden });
    } else if (record.type === RECORD.DATEMODE) {
      date1904 = (record.data[0] | (record.data[1] << 8)) === 1;
    } else if (record.type === RECORD.FORMAT) {
      const ifmt = record.data[0] | (record.data[1] << 8);
      customFormats.set(ifmt, readLongString(record.data, 2));
    } else if (record.type === RECORD.XF) {
      xfFormats.push(record.data[2] | (record.data[3] << 8));
    } else if (record.type === RECORD.SST) {
      const blocks: Uint8Array[] = [record.data];
      let cursor = index + 1;
      while (cursor < globals.length && globals[cursor].type === RECORD.CONTINUE) {
        blocks.push(globals[cursor].data);
        cursor += 1;
      }
      const reader = new SharedStringReader(blocks);
      reader.u32(); // общее количество строк
      const unique = reader.u32();
      const limit = Math.min(unique, 500000);
      const result: string[] = [];
      for (let stringIndex = 0; stringIndex < limit && !reader.done(); stringIndex += 1) {
        result.push(reader.readString());
      }
      sharedStrings = result;
      index = cursor - 1;
    }
  }

  const formatFor = (xfIndex: number) => {
    const numFmtId = xfFormats[xfIndex] ?? 0;
    return { numFmtId, formatCode: resolveFormatCode(numFmtId, customFormats) };
  };

  const sheets: SheetData[] = [];

  for (const boundSheet of boundSheets) {
    if (boundSheet.hidden) continue;
    const records = readRecords(stream, boundSheet.position);
    const rows: SheetCell[][] = [];
    let truncated = false;
    let pendingString: { row: number; column: number } | null = null;

    for (const record of records) {
      const data = record.data;
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

      switch (record.type) {
        case RECORD.EOF:
          break;
        case RECORD.NUMBER: {
          const row = view.getUint16(0, true);
          const column = view.getUint16(2, true);
          const xf = view.getUint16(4, true);
          const value = view.getFloat64(6, true);
          const { numFmtId, formatCode } = formatFor(xf);
          if (!setCell(rows, row, column, { text: formatNumber(value, numFmtId, formatCode, date1904), numeric: true })) truncated = true;
          break;
        }
        case RECORD.RK: {
          const row = view.getUint16(0, true);
          const column = view.getUint16(2, true);
          const xf = view.getUint16(4, true);
          const value = decodeRk(view.getUint32(6, true));
          const { numFmtId, formatCode } = formatFor(xf);
          if (!setCell(rows, row, column, { text: formatNumber(value, numFmtId, formatCode, date1904), numeric: true })) truncated = true;
          break;
        }
        case RECORD.MULRK: {
          const row = view.getUint16(0, true);
          const firstColumn = view.getUint16(2, true);
          const count = Math.floor((data.length - 6) / 6);
          for (let index = 0; index < count; index += 1) {
            const xf = view.getUint16(4 + index * 6, true);
            const value = decodeRk(view.getUint32(6 + index * 6, true));
            const { numFmtId, formatCode } = formatFor(xf);
            if (!setCell(rows, row, firstColumn + index, { text: formatNumber(value, numFmtId, formatCode, date1904), numeric: true })) truncated = true;
          }
          break;
        }
        case RECORD.LABELSST: {
          const row = view.getUint16(0, true);
          const column = view.getUint16(2, true);
          const stringIndex = view.getUint32(6, true);
          if (!setCell(rows, row, column, { text: sharedStrings[stringIndex] ?? "" })) truncated = true;
          break;
        }
        case RECORD.LABEL:
        case RECORD.RSTRING: {
          const row = view.getUint16(0, true);
          const column = view.getUint16(2, true);
          if (!setCell(rows, row, column, { text: readLongString(data, 6) })) truncated = true;
          break;
        }
        case RECORD.BOOLERR: {
          const row = view.getUint16(0, true);
          const column = view.getUint16(2, true);
          const isError = data[7] === 1;
          const text = isError ? "#ОШИБКА" : data[6] ? "ИСТИНА" : "ЛОЖЬ";
          if (!setCell(rows, row, column, { text })) truncated = true;
          break;
        }
        case RECORD.FORMULA: {
          const row = view.getUint16(0, true);
          const column = view.getUint16(2, true);
          const xf = view.getUint16(4, true);
          if (data[12] === 0xff && data[13] === 0xff) {
            if (data[6] === 0) { pendingString = { row, column }; }
            else if (data[6] === 1) { setCell(rows, row, column, { text: data[8] ? "ИСТИНА" : "ЛОЖЬ" }); }
            else if (data[6] === 2) { setCell(rows, row, column, { text: "#ОШИБКА" }); }
            else { setCell(rows, row, column, { text: "" }); }
          } else {
            const value = view.getFloat64(6, true);
            const { numFmtId, formatCode } = formatFor(xf);
            if (!setCell(rows, row, column, { text: formatNumber(value, numFmtId, formatCode, date1904), numeric: true })) truncated = true;
          }
          break;
        }
        case RECORD.STRING: {
          if (pendingString) {
            setCell(rows, pendingString.row, pendingString.column, { text: readLongString(data, 0) });
            pendingString = null;
          }
          break;
        }
        default:
          break;
      }

      if (record.type === RECORD.EOF) break;
    }

    const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
    for (const row of rows) {
      while (row.length < columnCount) row.push({ text: "" });
    }

    sheets.push({ name: boundSheet.name || "Лист", rows, columnCount, truncated });
  }

  if (!sheets.length) throw new Error("В книге нет доступных для просмотра листов.");
  return { kind: "workbook", sheets };
}
