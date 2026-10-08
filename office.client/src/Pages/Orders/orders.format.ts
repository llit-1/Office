import { dayToUtc, diffDays, mskToday } from "./orders.rules";
import type { DayString, OrderStatus } from "./orders.types";
import type { StatusTone } from "../../Components/StatusBadge/StatusBadge";

const MSK = "Europe/Moscow";

const dayFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
const weekdayFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC", weekday: "short" });
const dateTimeFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: MSK, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const momentFormat = new Intl.DateTimeFormat("ru-RU", { timeZone: MSK, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const moneyFormat = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 });
const priceFormat = new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

export const formatDay = (day: DayString) => dayFormat.format(dayToUtc(day));
export const formatWeekday = (day: DayString) => weekdayFormat.format(dayToUtc(day));
export const formatDateTime = (iso: string | number) => dateTimeFormat.format(new Date(iso)).replace(",", "");
/** «пт, 9 окт 12:00» */
export const formatMoment = (moment: string | number) => momentFormat.format(new Date(moment)).replace(/\./g, "").replace(/,(?=\s\d{1,2}:)/, "");
export const formatMoney = (value: number) => moneyFormat.format(value);
export const formatPrice = (value: number) => priceFormat.format(value);
export const formatQuantity = (value: number) => numberFormat.format(value);

/** «чт, 08.10» и подпись «завтра», если дата рядом. */
export function formatDelivery(day: DayString, now: Date) {
  const distance = diffDays(day, mskToday(now));
  const relative = distance === 0 ? "сегодня" : distance === 1 ? "завтра" : distance === 2 ? "послезавтра" : distance === -1 ? "вчера" : "";
  return { date: `${formatWeekday(day)}, ${formatDay(day).slice(0, 5)}`, relative };
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

export const statusLabels: Record<OrderStatus, string> = {
  open: "Принят",
  locked: "В работе",
  done: "Доставлен",
  cancelled: "Отменён",
};

export const statusTones: Record<OrderStatus, StatusTone> = {
  open: "success",
  locked: "info",
  done: "neutral",
  cancelled: "danger",
};

export const statusHints: Record<OrderStatus, string> = {
  open: "Заказ ещё можно изменить или отменить",
  locked: "Приём закрыт, заказ передан в работу",
  done: "Дата доставки прошла",
  cancelled: "Заказ отменён и не будет доставлен",
};

/** Понедельник первым: индекс 0 = пн. */
export const weekdayNames = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
