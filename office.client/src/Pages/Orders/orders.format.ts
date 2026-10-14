import { diffDays, mskToday, serverDay, serverMoment } from "./orders.rules";
import type { ServerDateTime } from "./orders.types";

const MSK = "Europe/Moscow";

const dayFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
const weekdayFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short" });
const momentFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: MSK, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

const dayToUtc = (day: string) => Date.parse(`${day}T00:00:00Z`);

/** «13.10.2026» */
export const formatDay = (value: ServerDateTime) => dayFormat.format(dayToUtc(serverDay(value)));
/** «вт, 13 окт 12:00» */
export const formatMoment = (value: ServerDateTime | number) =>
  momentFormat.format(new Date(typeof value === "number" ? value : serverMoment(value))).replace(/\./g, "").replace(/,(?=\s\d{1,2}:)/, "");
export const formatQuantity = (value: number) => numberFormat.format(value);

/** День без времени: «вт, 13.10» и подпись «завтра», если дата рядом. */
export function formatDelivery(value: ServerDateTime, now: Date) {
  const day = serverDay(value);
  const distance = diffDays(day, mskToday(now));
  const relative = distance === 0 ? "сегодня" : distance === 1 ? "завтра" : distance === 2 ? "послезавтра" : distance === -1 ? "вчера" : "";
  return { date: `${weekdayFormat.format(dayToUtc(day))}, ${dayFormat.format(dayToUtc(day)).slice(0, 5)}`, relative };
}

export function plural(count: number, one: string, few: string, many: string) {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

export const countLabel = (count: number, one: string, few: string, many: string) => `${formatQuantity(count)} ${plural(count, one, few, many)}`;
export const ordersLabel = (count: number) => countLabel(count, "заказ", "заказа", "заказов");
export const positionsLabel = (count: number) => countLabel(count, "позиция", "позиции", "позиций");

/** «3 дн 4 ч», «5 ч 12 мин», «18 мин». Пустая строка — срок уже прошёл. */
export function formatTimeLeft(until: number, now: Date) {
  const minutes = Math.floor((until - now.getTime()) / 60_000);
  if (minutes <= 0) return "";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return hours ? `${days} дн ${hours} ч` : `${days} дн`;
  if (hours > 0) return `${hours} ч ${minutes % 60} мин`;
  return `${minutes} мин`;
}
