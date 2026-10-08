/**
 * Ответы Яндекса приходят через сервис yeapi «как есть», их структура нигде не описана.
 * Поэтому таблицу собираем по факту: ищем первый список объектов и показываем его колонки.
 */
const ROW_CONTAINER_KEYS = ["blocks", "items", "orders", "data", "result", "results", "payload", "list", "records"];
const ID_KEYS = ["id", "blockid", "block_id", "uuid", "eatsid", "eats_id", "orderid", "order_id", "order_nr"];
const MAX_DEPTH = 4;
const MAX_CELL_LENGTH = 120;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function findRows(response: unknown, depth = 0): Record<string, unknown>[] {
  if (Array.isArray(response)) return response.filter(isRecord);
  if (!isRecord(response) || depth >= MAX_DEPTH) return [];

  for (const key of ROW_CONTAINER_KEYS) {
    if (key in response) {
      const rows = findRows(response[key], depth + 1);
      if (rows.length > 0) return rows;
    }
  }

  for (const value of Object.values(response)) {
    const rows = findRows(value, depth + 1);
    if (rows.length > 0) return rows;
  }

  return [];
}

export function columnsOf(rows: Record<string, unknown>[], limit = 12): string[] {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
      if (columns.length >= limit) return columns;
    }
  }
  return columns;
}

export function findRowId(row: Record<string, unknown>): string | null {
  for (const key of Object.keys(row)) {
    if (!ID_KEYS.includes(key.toLowerCase())) continue;
    const value = row[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?/;

export function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (ISO_DATE_TIME.test(value)) {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString("ru-RU");
    }
    return value.length > MAX_CELL_LENGTH ? `${value.slice(0, MAX_CELL_LENGTH)}…` : value;
  }

  const json = JSON.stringify(value);
  return json.length > MAX_CELL_LENGTH ? `${json.slice(0, MAX_CELL_LENGTH)}…` : json;
}

/** Значение поля «дата и время» в браузере приходит без секунд, а сервису нужен полный формат. */
export function toIsoSeconds(localValue: string): string {
  if (!localValue) return "";
  return localValue.length === 16 ? `${localValue}:00` : localValue;
}

export function toLocalInput(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Статусы и номера заказов вводятся списком через запятую, точку с запятой или перенос строки. */
export function parseList(text: string): string[] {
  return Array.from(new Set(
    text.split(/[\s,;]+/).map((part) => part.trim()).filter((part) => part.length > 0),
  ));
}

/** Подписи известных полей Яндекса. Незнакомые поля показываем под исходным именем. */
const COLUMN_LABELS: Record<string, string> = {
  id: "ID",
  blockid: "ID",
  block_id: "ID",
  created_at: "Создан",
  updated_at: "Обновлён",
  eats_id: "Номер",
  order_nr: "Номер",
  order_id: "ID заказа",
  delivery_type: "Доставка",
  items_cost: "Сумма",
  total_cost: "Итого",
  status: "Статус",
  service: "Сервис",
  cancel_reason: "Причина отмены",
  from: "Начало",
  started_at: "Начало",
  starts_at: "Начало",
  to: "Окончание",
  finished_at: "Окончание",
  ends_at: "Окончание",
  message: "Причина",
  reason: "Причина",
  tag: "Тег",
};

export function columnLabel(column: string): string {
  return COLUMN_LABELS[column.toLowerCase()] ?? column;
}

export type StatusTone = "success" | "danger" | "info" | "warning" | "neutral";

/** Статусы заказов и блокировок: подпись по-русски и цвет. Неизвестный статус показываем как есть. */
const STATUSES: Record<string, { label: string; tone: StatusTone }> = {
  created: { label: "Создан", tone: "info" },
  new: { label: "Новый", tone: "info" },
  accepted: { label: "Принят", tone: "info" },
  cooking: { label: "Готовится", tone: "info" },
  ready: { label: "Готов", tone: "info" },
  taken: { label: "В доставке", tone: "info" },
  in_delivery: { label: "В доставке", tone: "info" },
  delivered: { label: "Доставлен", tone: "success" },
  finished: { label: "Завершён", tone: "success" },
  completed: { label: "Завершён", tone: "success" },
  cancelled: { label: "Отменён", tone: "danger" },
  canceled: { label: "Отменён", tone: "danger" },
  rejected: { label: "Отклонён", tone: "danger" },
  active: { label: "Действует", tone: "danger" },
  scheduled: { label: "Запланирована", tone: "warning" },
  pending: { label: "Ожидает", tone: "warning" },
  expired: { label: "Истекла", tone: "neutral" },
  removed: { label: "Снята", tone: "neutral" },
  deleted: { label: "Снята", tone: "neutral" },
};

export function statusInfo(value: unknown): { label: string; tone: StatusTone } | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  return STATUSES[value.trim().toLowerCase()] ?? { label: value, tone: "neutral" };
}

export function rowStatus(row: Record<string, unknown>): string | null {
  const key = Object.keys(row).find((name) => name.toLowerCase() === "status");
  const value = key ? row[key] : null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

const MONEY_KEYS = new Set(["items_cost", "total_cost", "cost", "price", "amount"]);

/** Значение ячейки с учётом смысла колонки: сумма с рублём, причина из объекта { code, message }. */
export function formatValue(column: string, value: unknown): string {
  const key = column.toLowerCase();
  if (MONEY_KEYS.has(key) && (typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))))) {
    return `${Number(value).toLocaleString("ru-RU")} ₽`;
  }
  if (isRecord(value)) {
    const text = ["message", "reason", "code", "title", "name"]
      .map((name) => value[name])
      .find((part): part is string => typeof part === "string" && part.trim() !== "");
    if (text) return text;
  }
  return formatCell(value);
}

export type PeriodPreset = "today" | "yesterday" | "week";

export const periodPresets: { key: PeriodPreset; label: string }[] = [
  { key: "today", label: "Сегодня" },
  { key: "yesterday", label: "Вчера" },
  { key: "week", label: "7 дней" },
];

/** Границы периода для быстрых кнопок в формате поля «дата и время». */
export function presetRange(preset: PeriodPreset, now = new Date()): { from: string; to: string } {
  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = startOfDay(now);

  if (preset === "yesterday") {
    const from = new Date(today);
    from.setDate(from.getDate() - 1);
    return { from: toLocalInput(from), to: toLocalInput(today) };
  }

  if (preset === "week") {
    const from = new Date(today);
    from.setDate(from.getDate() - 6);
    return { from: toLocalInput(from), to: toLocalInput(now) };
  }

  return { from: toLocalInput(today), to: toLocalInput(now) };
}
