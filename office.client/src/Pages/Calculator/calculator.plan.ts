// Расчёт плана по остатку — перенос формулы старого портала (Views/Calculator/Calculate.cshtml).
// Сервер отдаёт средние продажи и коэффициенты, план считается здесь, сразу при вводе.
import type { CalculatorItem, CalculatorSheet } from "./calculator.types";

type Coefficients = Pick<CalculatorSheet, "reaction" | "thisCoefficient" | "nextCoefficient" | "secondCoefficient">;

/** Средние продажи от 0,3 до 1 штуки старый портал считал за 1 — чтобы редкая позиция не пропадала. */
const restAverage = (value: number) => (value < 0.3 || value > 1 ? value : 1);

/**
 * План: сколько выпечь при таком остатке. Если остаток кончится раньше, чем испечётся новая партия
 * (меньше продаж часов на приготовление), продажи этих часов не учитываем — их уже не успеть.
 */
export function planFor(item: CalculatorItem, sheet: Coefficients, rest: number): number {
  const k = item.itemCoefficient;
  const avgRest = restAverage(item.avgRest);
  const short = rest < item.avgProduction * k;
  const thisPart = short
    ? (avgRest - item.avgProduction) * sheet.thisCoefficient * k
    : avgRest * k * sheet.thisCoefficient - rest;
  const next = item.avgNext * sheet.nextCoefficient * k;
  const second = item.avgSecond * sheet.secondCoefficient * k;

  let plan = 0;
  if (sheet.reaction === 1) plan = Math.round(thisPart + item.addThis);
  else if (sheet.reaction === 2) plan = Math.round(next + thisPart + item.addThis + item.addNext);
  else if (sheet.reaction === 3) plan = Math.round(second + next + thisPart + item.addThis + item.addNext + item.addSecond);
  plan = Math.max(plan, 0);
  // на витрине должно остаться не меньше минимума
  if (plan < item.minShowCase - rest) plan = item.minShowCase - rest;
  return item.bunsPer ? roundToBuns(plan, item.bunsPer) : plan;
}

/** Сэндвичи — целыми булками: остаток от 30% булки добавляет ещё одну. */
export function roundToBuns(quantity: number, perBun: number): number {
  const remainder = quantity % perBun;
  return quantity - remainder + (remainder / perBun >= 0.3 ? perBun : 0);
}

/** Сколько булок уйдёт на такое количество сэндвичей. */
export const bunsFor = (quantity: number, perBun: number) => Math.ceil(quantity / perBun);

/** «40 мин», «2 ч», «2,5 ч». */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`;
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1).replace(".", ",")} ч`;
}

/** Время «чч:мм» через сколько-то минут от момента. */
export function timeAfter(from: Date, minutes: number): string {
  const at = new Date(from.getTime() + minutes * 60_000);
  return `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

export const formatTime = (value: string | Date) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

/** «до 15:00»; конец суток — «до конца дня». */
export const horizonLabel = (hour: number | null) =>
  hour === null ? "" : hour >= 24 ? "до конца дня" : `до ${String(hour).padStart(2, "0")}:00`;

/** Склонение: 1 булка, 2 булки, 5 булок. */
export function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
