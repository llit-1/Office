/** Лёгкий модуль без зависимостей — можно импортировать где угодно, не утягивая парсеры в основной бандл. */

export type OfficeViewerFormat = "docx" | "xlsx" | "doc" | "xls" | "csv" | "text";

const FORMAT_BY_EXTENSION: Record<string, OfficeViewerFormat> = {
  ".docx": "docx",
  ".docm": "docx",
  ".dotx": "docx",
  ".doc": "doc",
  ".dot": "doc",
  ".xlsx": "xlsx",
  ".xlsm": "xlsx",
  ".xltx": "xlsx",
  ".xls": "xls",
  ".xlt": "xls",
  ".csv": "csv",
  ".tsv": "csv",
  ".txt": "text",
  ".md": "text",
  ".log": "text",
};

export function getOfficeViewerFormat(extension: string): OfficeViewerFormat | null {
  const normalized = extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
  return FORMAT_BY_EXTENSION[normalized] ?? null;
}
