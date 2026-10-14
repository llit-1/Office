import type { CatalogItem, Order, OrdersPermissions, ServerDateTime } from "./orders.types";

// Сервер отдаёт даты заказов своим местным временем без смещения — московским.
// Чтобы сравнивать их с «сейчас» в любом часовом поясе браузера, смещение дописываем сами.
const MSK_OFFSET = "+03:00";
const MSK_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** Момент времени для серверной даты. */
export const serverMoment = (value: ServerDateTime) =>
  Date.parse(/(?:[zZ]|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}${MSK_OFFSET}`);

/** Календарный день серверной даты: «2026-10-13». */
export const serverDay = (value: ServerDateTime) => value.slice(0, 10);

/** Сегодняшний день по Москве. */
export const mskToday = (now: Date) => new Date(now.getTime() + MSK_OFFSET_MS).toISOString().slice(0, 10);

export const diffDays = (later: string, earlier: string) =>
  Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / DAY_MS);

/** Адрес редактора заказа: тип — в пути; торговая точка и дата формирования — в параметрах. */
export function editorPath(ruleId: number, query: { store?: string | null; date?: ServerDateTime | null } = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value) search.set(key, String(value));
  const tail = search.toString();
  return `/Orders/order/${ruleId}${tail ? `?${tail}` : ""}`;
}

/* ===== Доступные действия ===== */

/** Заказ открыт, пока не наступила дата формирования; после неё он уходит на сборку. */
export const isOrderOpen = (order: Pick<Order, "creationDateTime">, now: Date) => now.getTime() < serverMoment(order.creationDateTime);

/** Менять можно только открытый заказ — сформированный не меняет никто. */
export const canEditOrder = (order: Pick<Order, "creationDateTime">, now: Date, permissions: OrdersPermissions) =>
  permissions.canEdit && isOrderOpen(order, now);

/* ===== Количество ===== */

/** Технический предел — защита от опечаток при вводе: не больше стольких шагов одной позиции. */
const MAX_STEPS = 100;

export interface QuantityBounds {
  min: number;
  max: number;
  step: number;
}

// шаг бывает дробным (12,5 кг): 3 × 0,1 не должно превращаться в 0,30000000000000004
const roundQuantity = (value: number) => Number(value.toFixed(6));

/** Количество кратно шагу позиции; наименьшее — сам шаг. */
export function quantityBounds(item: Pick<CatalogItem, "step">): QuantityBounds {
  const step = item.step > 0 ? item.step : 1;
  return { min: step, max: roundQuantity(step * MAX_STEPS), step };
}

/** Приводит количество к допустимому: кратно шагу и в границах. 0 — убрать позицию. */
export function normalizeQuantity(value: number, bounds: QuantityBounds): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const steps = Math.max(1, Math.round(value / bounds.step));
  return roundQuantity(Math.min(bounds.max, Math.max(bounds.min, steps * bounds.step)));
}

export function getPermissions(roles: string[]): OrdersPermissions {
  const admin = roles.includes("OrdersTTAdmin");
  return { canEdit: admin || roles.includes("OrdersTT"), canConfigure: admin };
}
