export const OBJECT_CODE_LENGTH = 24;

// Сканер работает как клавиатура: в русской раскладке буквы A–F приходят как Ф, И, С, В, У, А.
const RUSSIAN_LAYOUT: Record<string, string> = {
  Ф: "A", И: "B", С: "C", В: "D", У: "E", А: "F",
  ф: "A", и: "B", с: "C", в: "D", у: "E", а: "F",
};

export function normalizeObjectCodeInput(raw: string): string {
  return Array.from(raw)
    .map((symbol) => RUSSIAN_LAYOUT[symbol] ?? symbol)
    .join("")
    .replace(/\s+/g, "")
    .toUpperCase();
}

/** Возвращает полный 24-символьный код или null, если ввод не похож на код метки. */
export function toObjectCode(raw: string): string | null {
  const value = normalizeObjectCodeInput(raw);
  if (!value || value.length > OBJECT_CODE_LENGTH || !/^[0-9A-F]+$/.test(value)) {
    return null;
  }

  return value.padStart(OBJECT_CODE_LENGTH, "0");
}

/** Код группами по 4 символа легче сверить с этикеткой. */
export function formatObjectCode(code: string): string {
  return code.match(/.{1,4}/g)?.join(" ") ?? code;
}

export function formatStockDateTime(value: string | null | undefined): string {
  if (!value) return "—";

  // Склад хранит московское время без зоны, поэтому части даты не пересчитываются в зону браузера.
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]} ${match[4]}:${match[5]}` : value;
}

export function pluralize(count: number, forms: [one: string, few: string, many: string]): string {
  const rest100 = Math.abs(count) % 100;
  const rest10 = rest100 % 10;
  if (rest100 > 10 && rest100 < 20) return forms[2];
  if (rest10 > 1 && rest10 < 5) return forms[1];
  if (rest10 === 1) return forms[0];
  return forms[2];
}

const numberFormatter = new Intl.NumberFormat("ru-RU");

export const formatCount = (count: number, forms: [string, string, string]) =>
  `${numberFormatter.format(count)} ${pluralize(count, forms)}`;

export const objectsLabel = (count: number) => formatCount(count, ["объект", "объекта", "объектов"]);

export const normalizeSearchText = (value: string) =>
  value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е");

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function readSessionValue<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeSessionValue(key: string, value: unknown | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Черновик — удобство, а не обязательное состояние: без sessionStorage страница продолжает работать.
  }
}
