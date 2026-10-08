import type { ReportCellValue, ReportColumnType } from "./reports.types";

export type PeriodPreset = "current-month" | "previous-month" | "last-7-days" | "custom";

const pad = (value: number) => String(value).padStart(2, "0");

/** Дата в формате yyyy-MM-dd по местному календарю, без сдвига в UTC. */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function presetRange(preset: Exclude<PeriodPreset, "custom">, today = new Date()): { from: string; to: string } {
  const year = today.getFullYear();
  const month = today.getMonth();

  if (preset === "previous-month") {
    return { from: toIsoDate(new Date(year, month - 1, 1)), to: toIsoDate(new Date(year, month, 0)) };
  }

  if (preset === "last-7-days") {
    return { from: toIsoDate(new Date(year, month, today.getDate() - 6)), to: toIsoDate(today) };
  }

  return { from: toIsoDate(new Date(year, month, 1)), to: toIsoDate(today) };
}

const dayNumber = (isoDate: string) => {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
};

export function validatePeriod(from: string, to: string, maxDays: number): string | null {
  if (!from || !to) return "Укажите начало и конец периода.";
  if (from > to) return "Дата начала не может быть позже даты окончания.";
  if (dayNumber(to) - dayNumber(from) > maxDays) return `Период не должен превышать ${maxDays} дней.`;
  return null;
}

export function formatIsoDate(value: string | null | undefined): string {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : "—";
}

export function formatDateTime(value: string | null | undefined): string {
  // Даты отчётов приходят в местном времени точки без зоны, поэтому части не пересчитываются.
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}` : "—";
}

const moneyFormatter = new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

export function formatReportValue(value: ReportCellValue | undefined, type: ReportColumnType): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "money" && typeof value === "number") return moneyFormatter.format(value);
  if (type === "number" && typeof value === "number") return numberFormatter.format(value);
  if (type === "datetime" && typeof value === "string") return formatDateTime(value);
  return String(value);
}

export const formatMoney = (value: number) => moneyFormatter.format(value);
export const formatNumber = (value: number) => numberFormatter.format(value);

export function sumColumn(rows: Array<Record<string, ReportCellValue>>, key: string): number {
  return rows.reduce((sum, row) => sum + (typeof row[key] === "number" ? (row[key] as number) : 0), 0);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ["КБ", "МБ", "ГБ"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)} ${units[unit]}`;
}

export const normalizeText = (value: string) => value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
