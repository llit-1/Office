import { CompoundFile } from "./cfb";
import type { DocumentData } from "./officeViewer.types";
import { escapeHtml } from "./officeViewer.types";

/**
 * Извлечение текста из Word 97-2003 (.doc) через таблицу кусков (piece table).
 * Форматирование не восстанавливается — показываем структурированный текст.
 */

const CP1252_HIGH: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
  0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152,
  0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022,
  0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};

function decodeCompressed(bytes: Uint8Array) {
  let text = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    text += String.fromCharCode(byte >= 0x80 && byte <= 0x9f ? CP1252_HIGH[byte] ?? byte : byte);
  }
  return text;
}

function decodeUtf16(bytes: Uint8Array) {
  let text = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    text += String.fromCharCode(bytes[index] | (bytes[index + 1] << 8));
  }
  return text;
}

/**
 * В .doc конец ячейки и конец строки таблицы — один и тот же символ 0x07, а признак
 * конца строки лежит в свойствах абзаца (PAPX), которые мы не разбираем. Зато известно,
 * что в строке одинаковое число ячеек, а последний 0x07 строки всегда «пустой».
 * Подбираем ширину: она должна делить поток нацело и давать пустую замыкающую ячейку.
 */
export function detectTableWidth(cells: string[]): number {
  const total = cells.length;
  for (let width = 1; width < Math.min(64, total); width += 1) {
    const step = width + 1;
    if (total % step !== 0) continue;
    let valid = true;
    for (let position = step - 1; position < total; position += step) {
      if (cells[position].trim() !== "") { valid = false; break; }
    }
    if (valid) return width;
  }
  return Math.max(1, total);
}

export function readDoc(buffer: ArrayBuffer): DocumentData {
  const container = new CompoundFile(buffer);
  const wordDocument = container.readStream("WordDocument");
  if (!wordDocument || wordDocument.length < 160) throw new Error("Не удалось прочитать документ Word 97-2003.");

  const view = new DataView(wordDocument.buffer, wordDocument.byteOffset, wordDocument.byteLength);
  const identifier = view.getUint16(0, true);
  if (identifier !== 0xa5ec) throw new Error("Файл повреждён или не является документом Word.");

  const nFib = view.getUint16(2, true);
  if (nFib < 193) throw new Error("Формат Word 6.0/95 не поддерживается для просмотра. Скачайте файл.");

  const flags = view.getUint16(10, true);
  if (flags & 0x0100) throw new Error("Документ защищён паролем — предпросмотр недоступен.");
  const tableStreamName = flags & 0x0200 ? "1Table" : "0Table";
  const table = container.readStream(tableStreamName);
  if (!table) throw new Error("Не удалось прочитать структуру документа.");

  const csw = view.getUint16(32, true);
  const cslwOffset = 34 + csw * 2;
  const cslw = view.getUint16(cslwOffset, true);
  const fibRgLwOffset = cslwOffset + 2;
  const ccpText = view.getUint32(fibRgLwOffset + 12, true);
  const fibRgFcLcbOffset = fibRgLwOffset + cslw * 4 + 2;

  const clxOffset = fibRgFcLcbOffset + 33 * 8;
  if (clxOffset + 8 > wordDocument.length) throw new Error("Не удалось прочитать структуру документа.");
  const fcClx = view.getUint32(clxOffset, true);
  const lcbClx = view.getUint32(clxOffset + 4, true);
  if (!lcbClx || fcClx + lcbClx > table.length) throw new Error("Не удалось прочитать структуру документа.");

  const clx = table.subarray(fcClx, fcClx + lcbClx);
  const clxView = new DataView(clx.buffer, clx.byteOffset, clx.byteLength);

  // Пропускаем блоки Prc (0x01), ищем Pcdt (0x02).
  let cursor = 0;
  let plcPcd: Uint8Array | null = null;
  while (cursor < clx.length) {
    const marker = clx[cursor];
    if (marker === 0x01) {
      const size = clxView.getUint16(cursor + 1, true);
      cursor += 3 + size;
    } else if (marker === 0x02) {
      const size = clxView.getUint32(cursor + 1, true);
      plcPcd = clx.subarray(cursor + 5, cursor + 5 + size);
      break;
    } else break;
  }
  if (!plcPcd) throw new Error("Не удалось прочитать текст документа.");

  const pieceCount = Math.floor((plcPcd.length - 4) / 12);
  const plcView = new DataView(plcPcd.buffer, plcPcd.byteOffset, plcPcd.byteLength);

  let raw = "";
  for (let index = 0; index < pieceCount; index += 1) {
    const cpStart = plcView.getUint32(index * 4, true);
    const cpEnd = plcView.getUint32((index + 1) * 4, true);
    const descriptorOffset = (pieceCount + 1) * 4 + index * 8;
    const fcValue = plcView.getUint32(descriptorOffset + 2, true);
    const compressed = (fcValue & 0x40000000) !== 0;
    const fc = compressed ? (fcValue & 0x3fffffff) / 2 : fcValue & 0x3fffffff;
    const characters = cpEnd - cpStart;
    if (characters <= 0) continue;

    const byteLength = compressed ? characters : characters * 2;
    const start = Math.floor(fc);
    if (start + byteLength > wordDocument.length) continue;
    const slice = wordDocument.subarray(start, start + byteLength);
    raw += compressed ? decodeCompressed(slice) : decodeUtf16(slice);
  }

  const mainText = ccpText > 0 ? raw.slice(0, ccpText) : raw;

  // Разбираем управляющие символы Word.
  const paragraphs: string[] = [];
  let buffer2 = "";
  let inField = false;
  /** Все ячейки текущей таблицы подряд: и концы ячеек, и концы строк — это один и тот же 0x07. */
  let tableCells: string[] = [];

  const flushTable = () => {
    if (!tableCells.length) return;
    const cells = tableCells;
    tableCells = [];

    const width = detectTableWidth(cells);
    const step = width + 1;
    const rows: string[][] = [];
    for (let start = 0; start + width <= cells.length; start += step) {
      rows.push(cells.slice(start, start + width).map((cell) => cell.trim()));
    }

    // Каркасные таблицы: убираем пустые строки и пустые колонки-отступы.
    const filled = rows.filter((row) => row.some((cell) => cell.length > 0));
    if (!filled.length) return;

    const keptColumns: number[] = [];
    for (let column = 0; column < width; column += 1) {
      if (filled.some((row) => (row[column] ?? "").length > 0)) keptColumns.push(column);
    }
    if (!keptColumns.length) return;

    // Таблица из одной содержательной колонки — это вёрстка, а не данные.
    if (keptColumns.length === 1) {
      const [column] = keptColumns;
      for (const row of filled) paragraphs.push(row[column] ?? "");
      return;
    }

    for (const row of filled) {
      const html = keptColumns
        .map((column) => `<td>${escapeHtml(row[column] ?? "").replace(/\n/g, "<br />") || "&nbsp;"}</td>`)
        .join("");
      paragraphs.push(`__ROW__${html}`);
    }
  };

  const pushParagraph = () => {
    flushTable();
    paragraphs.push(buffer2);
    buffer2 = "";
  };

  for (let index = 0; index < mainText.length; index += 1) {
    const code = mainText.charCodeAt(index);
    if (code === 0x13) { inField = true; continue; }
    if (code === 0x14 || code === 0x15) { inField = false; continue; }
    if (inField) continue;

    if (code === 0x07) { tableCells.push(buffer2); buffer2 = ""; continue; }
    if (code === 0x0d || code === 0x0c || code === 0x0e) { pushParagraph(); continue; }
    if (code === 0x0b) { buffer2 += "\n"; continue; }
    if (code === 0x1e) { buffer2 += "‑"; continue; }
    if (code === 0x1f) continue;
    if (code < 0x20 && code !== 0x09) continue;

    buffer2 += mainText[index];
  }
  if (buffer2) pushParagraph();
  flushTable();

  let html = "";
  let openTable = false;
  for (const paragraph of paragraphs) {
    if (paragraph.startsWith("__ROW__")) {
      if (!openTable) { html += '<table class="ov-table"><tbody>'; openTable = true; }
      html += `<tr>${paragraph.slice(7)}</tr>`;
      continue;
    }
    if (openTable) { html += "</tbody></table>"; openTable = false; }
    const trimmed = paragraph.trim();
    html += trimmed
      ? `<p>${escapeHtml(trimmed).replace(/\n/g, "<br />").replace(/\t/g, '<span class="ov-tab"></span>')}</p>`
      : "<p>&nbsp;</p>";
  }
  if (openTable) html += "</tbody></table>";

  if (!html) throw new Error("Документ пуст или его текст не удалось извлечь.");
  return { kind: "document", html, objectUrls: [], plainTextOnly: true };
}
