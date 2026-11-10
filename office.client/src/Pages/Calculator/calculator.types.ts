// Типы раздела «Калькуляторы». Совпадают с DTO CalculatorController.

export type CalculatorSlug = "bread" | "bakery" | "confectionery" | "sandwiches" | "other";

export interface CalculatorLocation {
  code: number;
  name: string;
}

export interface CalculatorBlock {
  /** soft — снимает точка, hard — только аудитор. */
  kind: "soft" | "hard";
  canUnlock: boolean;
  text: string;
}

export interface CalculatorLast {
  rest: number | null;
  result: number | null;
  fact: number | null;
  at: string;
}

export interface CalculatorItem {
  rkCode: number;
  name: string;
  defrostMinutes: number | null;
  bakingMode: string | null;
  minShowCase: number;
  /** Сэндвичей из одной булки. */
  bunsPer: number | null;
  /** Коэффициент позиции × коэффициент позиции на точке. */
  itemCoefficient: number;
  avgRest: number;
  avgProduction: number;
  avgNext: number;
  avgSecond: number;
  addThis: number;
  addNext: number;
  addSecond: number;
  addFrom: string[];
  block: CalculatorBlock | null;
  last: CalculatorLast | null;
}

export interface CalculatorSheet {
  slug: CalculatorSlug;
  title: string;
  ttCode: number;
  ttName: string;
  now: string;
  /** На сколько периодов вперёд считаем; 0 — сейчас не считаем. */
  reaction: number;
  period: string;
  periodFrom: number;
  periodTo: number;
  horizonHour: number | null;
  thisCoefficient: number;
  nextCoefficient: number;
  secondCoefficient: number;
  items: CalculatorItem[];
}

export interface CalculatorEntry {
  tt: number;
  rkCode: number;
  rest: number;
  result: number;
  fact: number | null;
}
