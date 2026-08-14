export interface SheetCell {
  text: string;
  numeric?: boolean;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  align?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  wrap?: boolean;
  /** Поворот текста в градусах по спецификации OOXML: 0–90 против часовой, 91–180 по часовой, 255 — «столбиком». */
  rotation?: number;
  color?: string;
  background?: string;
  fontSize?: number;
  fontFamily?: string;
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
  colSpan?: number;
  rowSpan?: number;
  hidden?: boolean;
}

export interface SheetData {
  name: string;
  rows: SheetCell[][];
  columnCount: number;
  columnWidths?: number[];
  rowHeights?: number[];
  /** Шрифт стиля «Обычный» — база для ячеек без явного шрифта. */
  defaultFont?: string;
  /** Кегль стиля «Обычный», px. */
  defaultFontSize?: number;
  /** Высота строки и ширина колонки по умолчанию для листа, px. */
  defaultRowHeight?: number;
  defaultColumnWidth?: number;
  truncated?: boolean;
}

export interface WorkbookData {
  kind: "workbook";
  sheets: SheetData[];
}

export interface DocumentData {
  kind: "document";
  /** Готовый безопасный HTML: строится только из экранированного текста. */
  html: string;
  objectUrls: string[];
  /** Шрифт и кегль документа по умолчанию. */
  fontFamily?: string;
  fontSize?: number;
  plainTextOnly?: boolean;
}

export interface PlainTextData {
  kind: "text";
  text: string;
}

export type OfficeDocument = WorkbookData | DocumentData | PlainTextData;

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
