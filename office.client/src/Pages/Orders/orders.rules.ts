import type {
  CatalogGroup,
  CatalogItem,
  DayString,
  DeliveryDay,
  Order,
  OrderLine,
  OrderStatus,
  OrderTypeConfig,
  OrdersPermissions,
  Store,
} from "./orders.types";

// Заказы живут по московскому времени независимо от часового пояса браузера.
// «Настенное» московское время получаем сдвигом на +3 часа и читаем UTC-геттерами,
// поэтому переход на летнее время у пользователя расчёты не ломает.
const MSK_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

export const dayToUtc = (day: DayString) => Date.parse(`${day}T00:00:00Z`);
export const utcToDay = (utc: number): DayString => new Date(utc).toISOString().slice(0, 10);
export const addDays = (day: DayString, count: number): DayString => utcToDay(dayToUtc(day) + count * DAY_MS);
export const diffDays = (later: DayString, earlier: DayString) => Math.round((dayToUtc(later) - dayToUtc(earlier)) / DAY_MS);

/** Сегодняшний день по Москве. */
export const mskToday = (now: Date): DayString => utcToDay(now.getTime() + MSK_OFFSET_MS);

/** Реальный момент времени для московских даты и времени «ЧЧ:ММ». */
export const mskMoment = (day: DayString, time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return dayToUtc(day) + ((hours || 0) * 60 + (minutes || 0)) * 60_000 - MSK_OFFSET_MS;
};

/* ===== Крон =====
   Пять полей: минута, час, день месяца, месяц, день недели (0 и 7 — воскресенье).
   Понимает «*», числа, диапазоны, списки, шаг «/n» и «L» — последний день месяца.
   День месяца и день недели сочетаются через «И», как в библиотеке Cronos на бэкенде:
   «0 0 16-22 * 1» — понедельник, выпавший на 16–22 число. */

export class CronError extends Error {}

interface CronSpec {
  minutes: number[];
  hours: number[];
  days: Set<number> | null;
  lastDay: boolean;
  months: Set<number> | null;
  weekdays: Set<number> | null;
}

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

function parseField(source: string, min: number, max: number, label: string): Set<number> | null {
  if (source === "*") return null;
  const values = new Set<number>();
  for (const part of source.split(",")) {
    const match = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part);
    const step = match?.[3] === undefined ? 1 : Number(match[3]);
    const from = !match ? Number.NaN : match[1] === "*" ? min : Number(match[1]);
    const to = !match ? Number.NaN : match[2] !== undefined ? Number(match[2]) : match[1] === "*" || match[3] !== undefined ? max : from;
    if (!match || step < 1 || from < min || to > max || from > to) {
      throw new CronError(`Поле «${label}»: не понимаю «${part}», допустимо от ${min} до ${max}.`);
    }
    for (let value = from; value <= to; value += step) values.add(value);
  }
  return values;
}

const specCache = new Map<string, CronSpec>();

function parseCron(expression: string): CronSpec {
  const cached = specCache.get(expression);
  if (cached) return cached;
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new CronError("В кроне пять полей: минута, час, день месяца, месяц, день недели.");
  const lastDay = fields[2].toUpperCase() === "L";
  const weekdays = parseField(fields[4], 0, 7, "день недели");
  const spec: CronSpec = {
    minutes: [...(parseField(fields[0], 0, 59, "минута") ?? range(0, 59))].sort((left, right) => left - right),
    hours: [...(parseField(fields[1], 0, 23, "час") ?? range(0, 23))].sort((left, right) => left - right),
    days: lastDay ? null : parseField(fields[2], 1, 31, "день месяца"),
    lastDay,
    months: parseField(fields[3], 1, 12, "месяц"),
    weekdays: weekdays && new Set([...weekdays].map((value) => value % 7)),
  };
  specCache.set(expression, spec);
  return spec;
}

/** Текст ошибки в крон-выражении или null, если оно корректно. */
export function cronError(expression: string): string | null {
  try {
    parseCron(expression);
    return null;
  } catch (error) {
    return error instanceof CronError ? error.message : "Некорректное крон-выражение.";
  }
}

/** Ближайшее срабатывание крона после момента from (с inclusive — начиная с него). Время московское. */
export function cronNext(expression: string, from: number, inclusive = false): number | null {
  const spec = parseCron(expression);
  const startDay = utcToDay(from + MSK_OFFSET_MS);
  // запас в четыре года: редкие выражения вроде «29 февраля» тоже находятся
  for (let shift = 0; shift <= 1500; shift += 1) {
    const day = addDays(startDay, shift);
    const date = new Date(dayToUtc(day));
    if (spec.months && !spec.months.has(date.getUTCMonth() + 1)) continue;
    if (spec.lastDay ? addDays(day, 1).slice(8) !== "01" : spec.days && !spec.days.has(date.getUTCDate())) continue;
    if (spec.weekdays && !spec.weekdays.has(date.getUTCDay())) continue;
    for (const hour of spec.hours) {
      for (const minute of spec.minutes) {
        const moment = dayToUtc(day) + (hour * 60 + minute) * 60_000 - MSK_OFFSET_MS;
        if (inclusive ? moment >= from : moment > from) return moment;
      }
    }
  }
  return null;
}

/* ===== Доставка ===== */

export interface DeliverySlot {
  /** Ближайшее закрытие приёма. */
  closeAt: number;
  deliveryDate: DayString;
}

/**
 * Одна формула на все вкладки: заказ попадает в первую доставку после ближайшего закрытия приёма.
 * Якорь — первый день по крону доставки не раньше даты закрытия; от него сдвиг ТТ или вкладки.
 * null — расписание задано с ошибкой.
 */
export function resolveSlot(type: OrderTypeConfig, storeOffset: number | null | undefined, now: Date): DeliverySlot | null {
  try {
    const closeAt = cronNext(type.closeCron, now.getTime());
    if (closeAt === null) return null;
    const closeDay = mskToday(new Date(closeAt));
    const anchor = cronNext(type.deliveryCron, dayToUtc(closeDay) - MSK_OFFSET_MS, true);
    if (anchor === null) return null;
    return { closeAt, deliveryDate: addDays(mskToday(new Date(anchor)), storeOffset ?? type.offsetDays) };
  } catch {
    return null;
  }
}

export const findStoreOffset = (deliveryDays: DeliveryDay[], typeId: number, storeId: number) =>
  deliveryDays.find((item) => item.typeId === typeId && item.storeId === storeId)?.offsetDays ?? null;

/** День недели якоря (1 = пн … 7 = вс), если крон доставки всегда попадает в один день недели; иначе null. */
export function anchorWeekday(type: Pick<OrderTypeConfig, "deliveryCron">): number | null {
  try {
    const weekdays = parseCron(type.deliveryCron).weekdays;
    if (!weekdays || weekdays.size !== 1) return null;
    const [weekday] = weekdays;
    return weekday === 0 ? 7 : weekday;
  } catch {
    return null;
  }
}

/* ===== Статус и доступные действия ===== */

export function getOrderStatus(order: Order, now: Date): OrderStatus {
  if (order.cancelledAt) return "cancelled";
  if (order.deliveryDate < mskToday(now)) return "done";
  return now.getTime() < Date.parse(order.closeAt) ? "open" : "locked";
}

export const canEditOrder = (order: Order, now: Date, permissions: OrdersPermissions) =>
  permissions.canEdit && getOrderStatus(order, now) === "open";

export function canCancelOrder(order: Order, now: Date, permissions: OrdersPermissions) {
  const status = getOrderStatus(order, now);
  return (status === "open" && permissions.canEdit) || (status === "locked" && permissions.canManageLocked);
}

/* ===== Количество ===== */

/** Сколько упаковок позиции можно заказать, если у неё не задан свой максимум. */
export const DEFAULT_MAX_STEPS = 100;

export interface QuantityBounds {
  min: number;
  max: number;
  step: number;
}

const roundQuantity = (value: number) => Number(value.toFixed(3));

export function quantityBounds(item: Pick<CatalogItem, "step" | "maxQuantity">): QuantityBounds {
  const step = item.step > 0 ? item.step : 1;
  return { min: step, max: Math.max(step, roundQuantity(item.maxQuantity ?? step * DEFAULT_MAX_STEPS)), step };
}

/** Приводит количество к допустимому: кратно шагу и в границах. 0 — убрать позицию. */
export function normalizeQuantity(value: number, bounds: QuantityBounds): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const steps = Math.max(1, Math.round(value / bounds.step));
  return roundQuantity(Math.min(bounds.max, Math.max(bounds.min, steps * bounds.step)));
}

/* ===== Каталог ===== */

export function isItemAvailable(item: CatalogItem, store: Store | undefined) {
  if (!item.isActive) return false;
  if (!store) return item.forOwn || item.forPartner;
  return store.management === "own" ? item.forOwn : item.forPartner;
}

export const toOrderLine = (item: CatalogItem, group: CatalogGroup | undefined, quantity: number): OrderLine => ({
  productId: item.id,
  article: item.article,
  name: item.name,
  groupName: group?.name ?? "",
  quantity,
  step: item.step,
  price: item.price,
});

/* ===== Итоги ===== */

export interface OrderTotals {
  positions: number;
  /** null — ни у одной позиции нет цены. */
  sum: number | null;
  /** Сколько позиций без цены не попало в сумму. */
  unpriced: number;
}

export function orderTotals(lines: OrderLine[]): OrderTotals {
  let sum = 0;
  let priced = 0;
  for (const line of lines) {
    if (line.price !== null) {
      sum += line.price * line.quantity;
      priced += 1;
    }
  }
  return { positions: lines.length, sum: priced ? Math.round(sum * 100) / 100 : null, unpriced: lines.length - priced };
}

export function getPermissions(roles: string[]): OrdersPermissions {
  const admin = roles.includes("OrdersTTAdmin");
  return { canEdit: admin || roles.includes("OrdersTT"), canManageLocked: admin, canConfigure: admin };
}
