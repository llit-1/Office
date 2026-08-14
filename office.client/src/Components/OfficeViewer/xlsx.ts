import { parseThemePalette, resolveBorder, resolveColor, type ThemePalette } from "./excelColors";
import { cssFontFamily, parseFontScheme, resolveThemeFont, type FontScheme } from "./officeFonts";
import { formatNumber, resolveFormatCode } from "./numberFormat";
import type { SheetCell, SheetData, WorkbookData } from "./officeViewer.types";
import { ZipArchive } from "./zip";

export const MAX_PREVIEW_ROWS = 2000;
export const MAX_PREVIEW_COLUMNS = 128;

/** Пункты Excel -> пиксели экрана (96 dpi). */
const PT_TO_PX = 96 / 72;

/**
 * Ширина колонки в Excel измеряется в «нулях» шрифта по умолчанию, поэтому нужна
 * ширина цифры в пикселях. Доля от кегля зависит от гарнитуры: у Calibri цифра уже,
 * чем у Arial. Для Calibri 11 и Arial 10 обе формулы дают привычные 7px.
 */
function maxDigitWidth(fontSizePt: number, fontFamily: string | undefined) {
  const emRatio = /calibri|carlito/i.test(fontFamily ?? "") ? 0.507 : 0.55;
  return Math.max(4, Math.round(fontSizePt * PT_TO_PX * emRatio));
}

/** Формула Excel для перевода ширины колонки в пиксели. */
function columnWidthToPx(width: number, digitWidth: number) {
  const px = Math.trunc(((256 * width + Math.trunc(128 / digitWidth)) / 256) * digitWidth);
  return Math.max(16, px);
}

function columnIndexFromRef(ref: string) {
  let index = 0;
  for (let position = 0; position < ref.length; position += 1) {
    const code = ref.charCodeAt(position);
    if (code < 65 || code > 90) break;
    index = index * 26 + (code - 64);
  }
  return Math.max(0, index - 1);
}

function parseSharedStrings(doc: Document | null): string[] {
  if (!doc) return [];
  const items = doc.getElementsByTagName("si");
  const result: string[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const node = items[index];
    const texts = node.getElementsByTagName("t");
    let value = "";
    for (let part = 0; part < texts.length; part += 1) {
      const parent = texts[part].parentElement?.tagName;
      if (parent && parent.endsWith("rPh")) continue;
      value += texts[part].textContent ?? "";
    }
    result.push(value);
  }
  return result;
}

interface FontInfo {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  size?: number;
  color?: string;
  family?: string;
}

interface BorderInfo {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

interface StyleInfo {
  numFmtId: number;
  formatCode: string;
  font: FontInfo;
  fill?: string;
  border?: BorderInfo;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  wrap?: boolean;
  rotation?: number;
}

const DEFAULT_FONT: FontInfo = { bold: false, italic: false, underline: false, strike: false };

function childByName(parent: Element | undefined, name: string) {
  if (!parent) return null;
  for (let index = 0; index < parent.children.length; index += 1) {
    if (parent.children[index].localName === name) return parent.children[index];
  }
  return null;
}

function parseFonts(doc: Document, palette: ThemePalette, scheme: FontScheme): FontInfo[] {
  const root = doc.getElementsByTagName("fonts")[0];
  const fonts: FontInfo[] = [];
  if (!root) return fonts;

  for (let index = 0; index < root.children.length; index += 1) {
    const node = root.children[index];
    if (node.localName !== "font") continue;
    const size = Number(childByName(node, "sz")?.getAttribute("val") ?? 0) || undefined;
    // Имя обычно записано явно; если его нет — берём шрифт темы по ссылке scheme.
    const name = childByName(node, "name")?.getAttribute("val")
      ?? childByName(node, "rFont")?.getAttribute("val")
      ?? resolveThemeFont(childByName(node, "scheme")?.getAttribute("val"), scheme);
    fonts.push({
      bold: Boolean(childByName(node, "b")),
      italic: Boolean(childByName(node, "i")),
      underline: Boolean(childByName(node, "u")),
      strike: Boolean(childByName(node, "strike")),
      size,
      color: resolveColor(childByName(node, "color"), palette) ?? undefined,
      family: cssFontFamily(name),
    });
  }
  return fonts;
}

function parseFills(doc: Document, palette: ThemePalette): (string | undefined)[] {
  const root = doc.getElementsByTagName("fills")[0];
  const fills: (string | undefined)[] = [];
  if (!root) return fills;

  for (let index = 0; index < root.children.length; index += 1) {
    const node = root.children[index];
    if (node.localName !== "fill") continue;
    const pattern = childByName(node, "patternFill");
    const gradient = childByName(node, "gradientFill");

    if (gradient) {
      const stop = childByName(gradient, "stop");
      fills.push(resolveColor(childByName(stop ?? undefined, "color"), palette) ?? undefined);
      continue;
    }
    if (!pattern) { fills.push(undefined); continue; }

    const type = pattern.getAttribute("patternType");
    if (!type || type === "none") { fills.push(undefined); continue; }
    const foreground = resolveColor(childByName(pattern, "fgColor"), palette);
    const background = resolveColor(childByName(pattern, "bgColor"), palette);
    fills.push((type === "solid" ? foreground : foreground ?? background) ?? undefined);
  }
  return fills;
}

function parseBorders(doc: Document, palette: ThemePalette): BorderInfo[] {
  const root = doc.getElementsByTagName("borders")[0];
  const borders: BorderInfo[] = [];
  if (!root) return borders;

  for (let index = 0; index < root.children.length; index += 1) {
    const node = root.children[index];
    if (node.localName !== "border") continue;
    borders.push({
      top: resolveBorder(childByName(node, "top"), palette) ?? undefined,
      right: resolveBorder(childByName(node, "right"), palette) ?? undefined,
      bottom: resolveBorder(childByName(node, "bottom"), palette) ?? undefined,
      left: resolveBorder(childByName(node, "left"), palette) ?? undefined,
    });
  }
  return borders;
}

function parseStyles(doc: Document | null, palette: ThemePalette, scheme: FontScheme): StyleInfo[] {
  if (!doc) return [];

  const customFormats = new Map<number, string>();
  const numFmts = doc.getElementsByTagName("numFmt");
  for (let index = 0; index < numFmts.length; index += 1) {
    const id = Number(numFmts[index].getAttribute("numFmtId"));
    const code = numFmts[index].getAttribute("formatCode") ?? "";
    if (Number.isFinite(id)) customFormats.set(id, code);
  }

  const fonts = parseFonts(doc, palette, scheme);
  const fills = parseFills(doc, palette);
  const borders = parseBorders(doc, palette);

  const cellXfsRoot = doc.getElementsByTagName("cellXfs")[0];
  const styles: StyleInfo[] = [];
  if (!cellXfsRoot) return styles;

  for (let index = 0; index < cellXfsRoot.children.length; index += 1) {
    const xf = cellXfsRoot.children[index];
    if (xf.localName !== "xf") continue;

    const numFmtId = Number(xf.getAttribute("numFmtId") ?? 0) || 0;
    const fontId = Number(xf.getAttribute("fontId") ?? 0) || 0;
    const fillId = Number(xf.getAttribute("fillId") ?? 0) || 0;
    const borderId = Number(xf.getAttribute("borderId") ?? 0) || 0;
    const alignment = childByName(xf, "alignment");
    const horizontal = alignment?.getAttribute("horizontal");
    const vertical = alignment?.getAttribute("vertical");
    const border = borders[borderId];

    styles.push({
      numFmtId,
      formatCode: resolveFormatCode(numFmtId, customFormats),
      font: fonts[fontId] ?? DEFAULT_FONT,
      fill: fills[fillId],
      border: border && (border.top || border.right || border.bottom || border.left) ? border : undefined,
      align: horizontal === "center" || horizontal === "right" || horizontal === "left" ? horizontal : undefined,
      verticalAlign: vertical === "top" ? "top" : vertical === "center" ? "middle" : vertical === "bottom" ? "bottom" : undefined,
      wrap: alignment?.getAttribute("wrapText") === "1" || undefined,
      rotation: Number(alignment?.getAttribute("textRotation") ?? 0) || undefined,
    });
  }
  return styles;
}

function cellFromStyle(
  text: string,
  numeric: boolean,
  style: StyleInfo | undefined,
  defaults: { font: string | undefined; fontSize: number | undefined },
): SheetCell {
  return {
    text,
    numeric,
    bold: style?.font.bold || undefined,
    italic: style?.font.italic || undefined,
    underline: style?.font.underline || undefined,
    strike: style?.font.strike || undefined,
    align: style?.align,
    verticalAlign: style?.verticalAlign,
    wrap: style?.wrap,
    rotation: style?.rotation,
    color: style?.font.color,
    background: style?.fill,
    // Шрифт и кегль листа заданы на таблице — в ячейку пишем только отличия.
    fontSize: style?.font.size && style.font.size !== defaults.fontSize ? style.font.size : undefined,
    fontFamily: style?.font.family !== defaults.font ? style?.font.family : undefined,
    borderTop: style?.border?.top,
    borderRight: style?.border?.right,
    borderBottom: style?.border?.bottom,
    borderLeft: style?.border?.left,
  };
}

function resolveTarget(target: string) {
  if (target.startsWith("/")) return target.slice(1);
  if (target.startsWith("xl/")) return target;
  return `xl/${target.replace(/^\.\//, "")}`;
}

function applyMerges(sheet: SheetData, merges: string[]) {
  for (const range of merges) {
    const [from, to] = range.split(":");
    if (!from || !to) continue;
    const startCol = columnIndexFromRef(from);
    const endCol = columnIndexFromRef(to);
    const startRow = Number(from.replace(/^[A-Z]+/, "")) - 1;
    const endRow = Number(to.replace(/^[A-Z]+/, "")) - 1;
    if (!Number.isFinite(startRow) || !Number.isFinite(endRow)) continue;
    if (startRow < 0 || startRow >= sheet.rows.length) continue;

    const anchor = sheet.rows[startRow]?.[startCol];
    if (!anchor) continue;
    anchor.colSpan = Math.max(1, endCol - startCol + 1);
    anchor.rowSpan = Math.max(1, Math.min(endRow, sheet.rows.length - 1) - startRow + 1);

    for (let row = startRow; row <= Math.min(endRow, sheet.rows.length - 1); row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        if (row === startRow && col === startCol) continue;
        const cell = sheet.rows[row]?.[col];
        if (cell) cell.hidden = true;
      }
    }
  }
}

export async function readXlsx(buffer: ArrayBuffer): Promise<WorkbookData> {
  const zip = ZipArchive.open(buffer);
  const workbook = await zip.readXml("xl/workbook.xml");
  if (!workbook) throw new Error("Не удалось прочитать книгу Excel.");

  const rels = await zip.readXml("xl/_rels/workbook.xml.rels");
  const relMap = new Map<string, string>();
  if (rels) {
    const nodes = rels.getElementsByTagName("Relationship");
    for (let index = 0; index < nodes.length; index += 1) {
      const id = nodes[index].getAttribute("Id");
      const target = nodes[index].getAttribute("Target");
      if (id && target) relMap.set(id, resolveTarget(target));
    }
  }

  const sharedStrings = parseSharedStrings(await zip.readXml("xl/sharedStrings.xml"));
  const theme = await zip.readXml("xl/theme/theme1.xml");
  const palette = parseThemePalette(theme);
  const fontScheme = parseFontScheme(theme);
  const styles = parseStyles(await zip.readXml("xl/styles.xml"), palette, fontScheme);
  // Стиль 0 в cellXfs — это «Обычный»: он задаёт базовый шрифт и кегль всего листа.
  const baseStyle = styles[0];
  const defaults = {
    font: baseStyle?.font.family ?? cssFontFamily(fontScheme.minor),
    fontSize: baseStyle?.font.size,
  };
  const digitWidth = maxDigitWidth(defaults.fontSize ?? 11, defaults.font);
  const date1904 = workbook.getElementsByTagName("workbookPr")[0]?.getAttribute("date1904") === "1";

  const sheetNodes = workbook.getElementsByTagName("sheet");
  const sheets: SheetData[] = [];

  for (let index = 0; index < sheetNodes.length; index += 1) {
    const node = sheetNodes[index];
    if (node.getAttribute("state") === "hidden" || node.getAttribute("state") === "veryHidden") continue;

    const name = node.getAttribute("name") ?? `Лист ${index + 1}`;
    const relId = node.getAttribute("r:id") ?? node.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const path = (relId && relMap.get(relId)) || `xl/worksheets/sheet${index + 1}.xml`;
    const sheetDoc = await zip.readXml(path);
    if (!sheetDoc) continue;

    const rows: SheetCell[][] = [];
    const rowHeights: number[] = [];
    let columnCount = 0;
    let truncated = false;

    const rowNodes = sheetDoc.getElementsByTagName("row");
    const rowLimit = Math.min(rowNodes.length, MAX_PREVIEW_ROWS);
    if (rowNodes.length > rowLimit) truncated = true;

    for (let rowIndex = 0; rowIndex < rowLimit; rowIndex += 1) {
      const rowNode = rowNodes[rowIndex];
      const targetRow = Number(rowNode.getAttribute("r") ?? rowIndex + 1) - 1;
      if (!Number.isFinite(targetRow) || targetRow < 0 || targetRow >= MAX_PREVIEW_ROWS) continue;
      while (rows.length <= targetRow) rows.push([]);
      const cells = rows[targetRow];

      const height = Number(rowNode.getAttribute("ht") ?? 0);
      if (height > 0) rowHeights[targetRow] = Math.round(height * PT_TO_PX);

      const rowStyleIndex = rowNode.getAttribute("customFormat") === "1"
        ? Number(rowNode.getAttribute("s") ?? -1)
        : -1;
      const rowStyle = rowStyleIndex >= 0 ? styles[rowStyleIndex] : undefined;

      const cellNodes = rowNode.getElementsByTagName("c");
      for (let cellIndex = 0; cellIndex < cellNodes.length; cellIndex += 1) {
        const cellNode = cellNodes[cellIndex];
        const ref = cellNode.getAttribute("r") ?? "";
        const columnIndex = ref ? columnIndexFromRef(ref) : cellIndex;
        if (columnIndex >= MAX_PREVIEW_COLUMNS) { truncated = true; continue; }

        const type = cellNode.getAttribute("t") ?? "n";
        // Атрибут s необязателен: без него действует стиль строки, а если и его нет — стиль 0 («Обычный»).
        const ownStyle = cellNode.getAttribute("s");
        const styleIndex = ownStyle !== null ? Number(ownStyle) : Math.max(0, rowStyleIndex);
        const style = styles[styleIndex] ?? rowStyle ?? styles[0];

        let text = "";
        let numeric = false;

        if (type === "inlineStr") {
          const isNode = cellNode.getElementsByTagName("t");
          for (let part = 0; part < isNode.length; part += 1) text += isNode[part].textContent ?? "";
        } else {
          const valueNode = cellNode.getElementsByTagName("v")[0];
          const raw = valueNode?.textContent ?? "";
          if (raw === "") {
            text = "";
          } else if (type === "s") {
            text = sharedStrings[Number(raw)] ?? "";
          } else if (type === "str") {
            text = raw;
          } else if (type === "b") {
            text = raw === "1" ? "ИСТИНА" : "ЛОЖЬ";
          } else if (type === "e") {
            text = raw;
          } else if (type === "d") {
            text = raw;
          } else {
            const value = Number(raw);
            numeric = Number.isFinite(value);
            text = numeric
              ? formatNumber(value, style?.numFmtId ?? 0, style?.formatCode ?? "General", date1904)
              : raw;
          }
        }

        while (cells.length <= columnIndex) cells.push({ text: "" });
        cells[columnIndex] = cellFromStyle(text, numeric, style, defaults);
        columnCount = Math.max(columnCount, columnIndex + 1);
      }
    }

    // Выравниваем длину строк.
    for (const row of rows) {
      while (row.length < columnCount) row.push({ text: "" });
    }

    const columnWidths: number[] = [];
    const colNodes = sheetDoc.getElementsByTagName("col");
    for (let colIndex = 0; colIndex < colNodes.length; colIndex += 1) {
      const colNode = colNodes[colIndex];
      const min = Number(colNode.getAttribute("min") ?? 0);
      const max = Number(colNode.getAttribute("max") ?? 0);
      const width = Number(colNode.getAttribute("width") ?? 0);
      const hidden = colNode.getAttribute("hidden") === "1";
      if (!width && !hidden) continue;
      for (let column = min - 1; column < Math.min(max, MAX_PREVIEW_COLUMNS); column += 1) {
        if (column >= 0) columnWidths[column] = hidden ? 0 : columnWidthToPx(width, digitWidth);
      }
    }

    const formatPr = sheetDoc.getElementsByTagName("sheetFormatPr")[0];
    const defaultRowHeightPt = Number(formatPr?.getAttribute("defaultRowHeight") ?? 0) || 0;
    const defaultColWidthChars = Number(formatPr?.getAttribute("defaultColWidth") ?? 0)
      || Number(formatPr?.getAttribute("baseColWidth") ?? 0)
      || 8.43;

    const sheet: SheetData = {
      name,
      rows,
      columnCount,
      columnWidths,
      rowHeights,
      defaultFont: defaults.font,
      defaultFontSize: defaults.fontSize ? Math.round(defaults.fontSize * PT_TO_PX * 10) / 10 : undefined,
      defaultRowHeight: defaultRowHeightPt ? Math.round(defaultRowHeightPt * PT_TO_PX) : undefined,
      defaultColumnWidth: columnWidthToPx(defaultColWidthChars, digitWidth),
      truncated,
    };

    const mergeNodes = sheetDoc.getElementsByTagName("mergeCell");
    const merges: string[] = [];
    for (let mergeIndex = 0; mergeIndex < mergeNodes.length; mergeIndex += 1) {
      const ref = mergeNodes[mergeIndex].getAttribute("ref");
      if (ref) merges.push(ref);
    }
    applyMerges(sheet, merges);

    sheets.push(sheet);
  }

  if (!sheets.length) throw new Error("В книге нет доступных для просмотра листов.");
  return { kind: "workbook", sheets };
}

export function readCsv(text: string, name: string): WorkbookData {
  const withoutBom = text.replace(/^\uFEFF/, "");
  const delimiter = (() => {
    const firstLine = withoutBom.split(/\r?\n/, 1)[0] ?? "";
    const counts = [";", ",", "\t", "|"].map((candidate) => ({
      candidate,
      count: firstLine.split(candidate).length - 1,
    }));
    counts.sort((a, b) => b.count - a.count);
    return counts[0].count > 0 ? counts[0].candidate : ";";
  })();

  const rows: SheetCell[][] = [];
  let current: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < withoutBom.length; index += 1) {
    const char = withoutBom[index];
    if (inQuotes) {
      if (char === '"') {
        if (withoutBom[index + 1] === '"') { value += '"'; index += 1; }
        else inQuotes = false;
      } else value += char;
      continue;
    }
    if (char === '"') { inQuotes = true; continue; }
    if (char === delimiter) { current.push(value); value = ""; continue; }
    if (char === "\n") {
      current.push(value);
      rows.push(current.map((item) => ({ text: item.trim() })));
      current = [];
      value = "";
      continue;
    }
    if (char === "\r") continue;
    value += char;
  }
  if (value.length || current.length) {
    current.push(value);
    rows.push(current.map((item) => ({ text: item.trim() })));
  }

  const truncated = rows.length > MAX_PREVIEW_ROWS;
  const limited = truncated ? rows.slice(0, MAX_PREVIEW_ROWS) : rows;
  const columnCount = limited.reduce((max, row) => Math.max(max, row.length), 0);
  for (const row of limited) {
    while (row.length < columnCount) row.push({ text: "" });
  }

  return { kind: "workbook", sheets: [{ name, rows: limited, columnCount, truncated }] };
}
