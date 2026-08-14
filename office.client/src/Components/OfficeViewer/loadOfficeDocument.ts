import { isCompoundFile } from "./cfb";
import { readDoc } from "./docLegacy";
import { readDocx } from "./docx";
import type { OfficeDocument } from "./officeViewer.types";
import type { OfficeViewerFormat } from "./officeFormats";
import { readCsv, readXlsx } from "./xlsx";
import { isDeflateSupported } from "./zip";

export { getOfficeViewerFormat } from "./officeFormats";
export type { OfficeViewerFormat } from "./officeFormats";

function decodeText(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  // Эвристика: много символов замены -> вероятно, windows-1251.
  const replacements = (utf8.match(/\uFFFD/g) ?? []).length;
  if (replacements > Math.max(3, utf8.length * 0.01)) {
    try {
      return new TextDecoder("windows-1251").decode(bytes);
    } catch {
      return utf8;
    }
  }
  return utf8;
}

export async function loadOfficeDocument(
  buffer: ArrayBuffer,
  format: OfficeViewerFormat,
  fileName: string,
): Promise<OfficeDocument> {
  const bytes = new Uint8Array(buffer);

  if (format === "text") {
    return { kind: "text", text: decodeText(buffer) };
  }
  if (format === "csv") {
    return readCsv(decodeText(buffer), fileName);
  }

  // Файлы иногда имеют «неправильное» расширение — уточняем по сигнатуре.
  const looksZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const looksOle = isCompoundFile(bytes);

  let effective = format;
  if ((format === "docx" || format === "xlsx") && !looksZip && looksOle) {
    effective = format === "docx" ? "doc" : "xls";
  } else if ((format === "doc" || format === "xls") && looksZip) {
    effective = format === "doc" ? "docx" : "xlsx";
  }

  if ((effective === "docx" || effective === "xlsx") && !isDeflateSupported()) {
    throw new Error("Браузер не поддерживает предпросмотр этого формата. Обновите браузер или скачайте файл.");
  }

  switch (effective) {
    case "docx":
      return await readDocx(buffer);
    case "xlsx":
      return await readXlsx(buffer);
    case "doc":
      return readDoc(buffer);
    case "xls":
      return (await import("./xlsLegacy")).readXls(buffer);
    default:
      throw new Error("Формат не поддерживается для предпросмотра.");
  }
}
