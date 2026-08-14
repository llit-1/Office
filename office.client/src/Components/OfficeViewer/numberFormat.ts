/** Минимальное форматирование чисел/дат Excel — достаточное для превью. */

const BUILTIN_DATE_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57, 58]);

const BUILTIN_FORMATS: Record<number, string> = {
  0: "General",
  1: "0",
  2: "0.00",
  3: "#,##0",
  4: "#,##0.00",
  9: "0%",
  10: "0.00%",
  11: "0.00E+00",
  14: "dd.mm.yyyy",
  15: "d-mmm-yy",
  16: "d-mmm",
  17: "mmm-yy",
  18: "h:mm AM/PM",
  19: "h:mm:ss AM/PM",
  20: "h:mm",
  21: "h:mm:ss",
  22: "dd.mm.yyyy h:mm",
  37: "#,##0;-#,##0",
  38: "#,##0;[Red]-#,##0",
  39: "#,##0.00;-#,##0.00",
  40: "#,##0.00;[Red]-#,##0.00",
  45: "mm:ss",
  46: "[h]:mm:ss",
  47: "mm:ss.0",
  48: "##0.0E+0",
  49: "@",
};

export function resolveFormatCode(numFmtId: number, custom: Map<number, string>) {
  return custom.get(numFmtId) ?? BUILTIN_FORMATS[numFmtId] ?? "General";
}

export function isDateFormat(numFmtId: number, formatCode: string) {
  if (BUILTIN_DATE_IDS.has(numFmtId)) return true;
  if (!formatCode || formatCode === "General") return false;
  // Отбрасываем литералы в кавычках и цветовые/условные секции.
  const stripped = formatCode
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\\./g, "");
  return /[yYdD]/.test(stripped) || /(^|[^a-zA-Z])m{1,5}([^a-zA-Z]|$)/.test(stripped) && /[hHsS]/.test(stripped);
}

function pad(value: number, length = 2) {
  return String(value).padStart(length, "0");
}

/** Серийная дата Excel -> строка. */
export function formatExcelDate(serial: number, formatCode: string, date1904 = false) {
  const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  // В Excel есть несуществующее 29.02.1900 — компенсируем для значений после него.
  const adjusted = !date1904 && serial >= 60 ? serial : serial;
  const ms = base + Math.round(adjusted * 86400000);
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return String(serial);

  const day = date.getUTCDate();
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  const hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const seconds = date.getUTCSeconds();

  const stripped = formatCode.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "");
  const hasDate = /[yd]/i.test(stripped);
  const hasTime = /[hs]/i.test(stripped) || /\bmm:ss\b/i.test(stripped);

  const datePart = `${pad(day)}.${pad(month)}.${year}`;
  const timePart = seconds ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(hours)}:${pad(minutes)}`;

  if (hasDate && hasTime) return `${datePart} ${timePart}`;
  if (hasTime && !hasDate) return timePart;
  return datePart;
}

function decimalsFromFormat(formatCode: string) {
  const section = formatCode.split(";")[0] ?? formatCode;
  const match = section.match(/\.(0+)/);
  return match ? match[1].length : null;
}

export function formatNumber(value: number, numFmtId: number, formatCode: string, date1904 = false) {
  if (!Number.isFinite(value)) return "";
  if (isDateFormat(numFmtId, formatCode)) return formatExcelDate(value, formatCode, date1904);

  const section = formatCode.split(";")[0] ?? formatCode;
  const isPercent = section.includes("%");
  const grouped = section.includes("#,##") || section.includes("# ##");
  const scaled = isPercent ? value * 100 : value;
  const decimals = decimalsFromFormat(section);

  let text: string;
  if (decimals !== null) {
    text = scaled.toFixed(decimals);
  } else if (Number.isInteger(scaled)) {
    text = String(scaled);
  } else {
    text = String(Math.round(scaled * 1e10) / 1e10);
  }

  if (grouped) {
    const [whole, fraction] = text.split(".");
    const sign = whole.startsWith("-") ? "-" : "";
    const digits = sign ? whole.slice(1) : whole;
    // Неразрывный пробел как разделитель разрядов.
    const withSeparators = digits.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
    text = sign + withSeparators + (fraction ? `.${fraction}` : "");
  }

  // Русская локаль: десятичный разделитель — запятая.
  if (!/[eE]/.test(text)) text = text.replace(".", ",");

  return isPercent ? `${text}%` : text;
}

/** Декодирование RK-значения (BIFF). */
export function decodeRk(rk: number) {
  const isInteger = (rk & 0x02) !== 0;
  const isDivided = (rk & 0x01) !== 0;
  let value: number;
  if (isInteger) {
    value = rk >> 2;
  } else {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setUint32(4, rk & 0xfffffffc, true);
    view.setUint32(0, 0, true);
    value = view.getFloat64(0, true);
  }
  return isDivided ? value / 100 : value;
}
