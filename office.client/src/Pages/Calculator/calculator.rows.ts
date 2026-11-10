// Строки калькулятора: что ввели, какой план и что уходит в работу.
import { bunsFor, planFor } from "./calculator.plan";
import type { CalculatorItem, CalculatorSheet } from "./calculator.types";

/** pending — ждём паузы во вводе. */
export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

export interface EntryState {
  rest: string;
  fact: string;
  status: SaveStatus;
  /** Остаток и план из лога за полчаса: пока остаток тот же, план показываем сохранённый. */
  loggedRest?: string;
  loggedPlan?: number;
}

export const EMPTY_ENTRY: EntryState = { rest: "", fact: "", status: "idle" };

export interface RowModel {
  item: CalculatorItem;
  entry: EntryState;
  plan: number | null;
  /** Что уходит в работу: факт, а без него план; null — не посчитано. */
  taken: number | null;
}

export function buildRow(item: CalculatorItem, sheet: CalculatorSheet, entry: EntryState = EMPTY_ENTRY): RowModel {
  if (entry.rest === "") return { item, entry, plan: null, taken: null };
  const plan = entry.loggedPlan !== undefined && entry.rest === entry.loggedRest
    ? entry.loggedPlan
    : planFor(item, sheet, Number(entry.rest));
  return { item, entry, plan, taken: entry.fact === "" ? plan : Number(entry.fact) };
}

export interface Summary {
  /** Сколько позиций можно заполнить (не заблокированы) и сколько заполнено. */
  total: number;
  entered: number;
  plan: number;
  /** Факт, а без него план. */
  taken: number;
  /** Сколько булок уйдёт; null — не сэндвичи. */
  buns: number | null;
}

/** Короткий итог: сколько ввели и что получилось. */
export function buildSummary(rows: RowModel[]): Summary {
  let buns: number | null = null;
  const summary = { total: rows.length, entered: 0, plan: 0, taken: 0 };
  for (const row of rows) {
    if (row.plan === null || row.taken === null) continue;
    summary.entered += 1;
    summary.plan += row.plan;
    summary.taken += row.taken;
    if (row.item.bunsPer) buns = (buns ?? 0) + bunsFor(row.taken, row.item.bunsPer);
  }
  return { ...summary, buns };
}
