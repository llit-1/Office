import type { Cell, SheetData } from "write-excel-file/browser";
import type { ReportCellValue, ReportColumnType, ReportTable } from "./reports.types";

const INVALID_FILE_NAME = /[\\/:*?"<>|]+/g;

function toDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds ?? 0));
}

function toCell(value: ReportCellValue | undefined, type: ReportColumnType, borderColor: string): Cell {
  const base = { borderColor, borderStyle: "thin" as const, alignVertical: "center" as const };

  if (value === null || value === undefined || value === "") {
    return { ...base, value: "", type: String };
  }

  if ((type === "number" || type === "money") && typeof value === "number") {
    // Формат «#,##0.###» у целых чисел оставляет в Excel висящую запятую («5,»), поэтому целым нужен свой формат.
    const format = type === "money" ? "#,##0.00" : Number.isInteger(value) ? "#,##0" : "#,##0.###";
    return { ...base, value, type: Number, format };
  }

  if (type === "datetime" && typeof value === "string") {
    const date = toDate(value);
    if (date) return { ...base, value: date, type: Date, format: "dd.mm.yyyy hh:mm" };
  }

  return { ...base, value: String(value), type: String };
}

/**
 * Выгружает отчёт в Excel настоящими числами и датами, чтобы в файле работали сортировка и суммы.
 * Палитра берётся из токенов экспорта: документ остаётся светлым независимо от темы портала.
 */
export async function exportReportTable(table: ReportTable, fileName: string): Promise<void> {
  const rootStyles = getComputedStyle(document.documentElement);
  const token = (name: string) => rootStyles.getPropertyValue(name).trim();
  const borderColor = token("--color-export-border");

  const header: Cell[] = table.columns.map((column) => ({
    value: column.label,
    type: String,
    fontWeight: "bold",
    textColor: token("--color-export-header-text"),
    backgroundColor: token("--color-export-header"),
    borderColor,
    borderStyle: "thin",
    alignVertical: "center",
    wrap: true,
    height: 28,
  }));

  const body: Cell[][] = table.rows.map((row) =>
    table.columns.map((column) => toCell(row[column.key], column.type, borderColor)));

  const columns = table.columns.map((column) => {
    const longest = Math.max(
      column.label.length,
      ...table.rows.slice(0, 500).map((row) => String(row[column.key] ?? "").length),
    );
    return { width: Math.min(48, Math.max(12, longest + 2)) };
  });

  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  await writeXlsxFile([header, ...body] as SheetData, {
    sheet: "Отчёт",
    columns,
    stickyRowsCount: 1,
    showGridLines: false,
  }).toFile(`${fileName.replace(INVALID_FILE_NAME, " ").trim() || "Отчёт"}.xlsx`);
}
