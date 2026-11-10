import { describe, expect, it } from "vitest";
import { bunsFor, formatDuration, planFor, roundToBuns } from "../../Pages/Calculator/calculator.plan";
import { buildRow, buildSummary, EMPTY_ENTRY } from "../../Pages/Calculator/calculator.rows";
import type { CalculatorItem, CalculatorSheet } from "../../Pages/Calculator/calculator.types";

/**
 * Формула старого портала (Views/Calculator/Calculate.cshtml, calculate + getResultWithMinShowCase + bunsCorrect)
 * почти дословно — эталон для переноса.
 */
function legacyPlan(item: CalculatorItem, reaction: number, c: [number, number, number], rest: number) {
  let averageRestOfThisPeriod = item.avgRest;
  if (+averageRestOfThisPeriod < 0.3 || +averageRestOfThisPeriod > 1) {
    // как есть
  } else {
    averageRestOfThisPeriod = 1;
  }
  const itemCoef = item.itemCoefficient;
  const itemOnTTCoef = 1;
  const [thisPeriodCoefficient, nextPeriodCoefficient, nextSecondPeriodCoefficient] = c;
  const { avgNext: averageNextPer, avgSecond: averageSecondNextPer, avgProduction: averageProductionPeriod } = item;
  const { addThis: thisPeriodAdding, addNext: nextPeriodAdding, addSecond: secondNextPeriodAdding } = item;
  let resp = 0;
  switch (reaction) {
    case 0:
      resp = 0;
      break;
    case 1:
      if (rest < averageProductionPeriod * itemCoef * itemOnTTCoef) {
        resp = Math.round((averageRestOfThisPeriod - averageProductionPeriod) * itemCoef * itemOnTTCoef * thisPeriodCoefficient + thisPeriodAdding);
        break;
      }
      resp = Math.round(averageRestOfThisPeriod * itemCoef * itemOnTTCoef * thisPeriodCoefficient - rest + thisPeriodAdding);
      break;
    case 2:
      if (rest < averageProductionPeriod * itemCoef * itemOnTTCoef) {
        resp = Math.round((averageNextPer * nextPeriodCoefficient + (averageRestOfThisPeriod - averageProductionPeriod) * thisPeriodCoefficient) * itemCoef * itemOnTTCoef + thisPeriodAdding + nextPeriodAdding);
        break;
      }
      resp = Math.round(averageNextPer * itemCoef * itemOnTTCoef * nextPeriodCoefficient + (averageRestOfThisPeriod * itemCoef * itemOnTTCoef * thisPeriodCoefficient - rest) + thisPeriodAdding + nextPeriodAdding);
      break;
    case 3:
      if (rest < averageProductionPeriod * itemCoef * itemOnTTCoef) {
        resp = Math.round((averageSecondNextPer * nextSecondPeriodCoefficient + averageNextPer * nextPeriodCoefficient + (averageRestOfThisPeriod - averageProductionPeriod) * thisPeriodCoefficient) * itemCoef * itemOnTTCoef + thisPeriodAdding + nextPeriodAdding + secondNextPeriodAdding);
        break;
      }
      resp = Math.round((averageSecondNextPer * nextSecondPeriodCoefficient + averageNextPer * nextPeriodCoefficient) * itemCoef * itemOnTTCoef + (averageRestOfThisPeriod * itemCoef * itemOnTTCoef * thisPeriodCoefficient - rest) + thisPeriodAdding + nextPeriodAdding + secondNextPeriodAdding);
      break;
  }
  if (resp < 0) resp = 0;
  if (!(resp >= item.minShowCase - rest)) resp = item.minShowCase - rest;
  if (item.bunsPer) {
    const remainder = resp % item.bunsPer;
    resp = resp - remainder;
    if (remainder / item.bunsPer >= 0.3) resp = resp + item.bunsPer;
  }
  return resp;
}

const item = (patch: Partial<CalculatorItem> = {}): CalculatorItem => ({
  rkCode: 1,
  name: "Круассан",
  defrostMinutes: 30,
  bakingMode: "P1",
  minShowCase: 4,
  bunsPer: null,
  itemCoefficient: 1.15,
  avgRest: 2,
  avgProduction: 0.5,
  avgNext: 3.5,
  avgSecond: 2.5,
  addThis: 0,
  addNext: 0,
  addSecond: 0,
  addFrom: [],
  block: null,
  last: null,
  ...patch,
});

const sheet = (reaction: number, items: CalculatorItem[] = []): CalculatorSheet => ({
  slug: "bakery",
  title: "Выпечка",
  ttCode: 1,
  ttName: "Невский 96",
  now: "2026-10-16T10:05:00",
  reaction,
  period: "Утро",
  periodFrom: 7,
  periodTo: 11,
  horizonHour: 18,
  thisCoefficient: 1.5,
  nextCoefficient: 1.4,
  secondCoefficient: 1.15,
  items,
});

describe("план", () => {
  it("совпадает со старым порталом на любых данных", () => {
    // детерминированный генератор, чтобы падение воспроизводилось
    let seed = 42;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 5000; i++) {
      const it = item({
        itemCoefficient: 1 + Math.round(random() * 40) / 100,
        avgRest: Math.round(random() * 1500) / 100,
        avgProduction: Math.round(random() * 300) / 100,
        avgNext: Math.round(random() * 1200) / 100,
        avgSecond: Math.round(random() * 1200) / 100,
        addThis: random() < 0.2 ? random() * 3 : 0,
        addNext: random() < 0.2 ? random() * 3 : 0,
        addSecond: random() < 0.2 ? random() * 3 : 0,
        minShowCase: Math.floor(random() * 6),
        bunsPer: random() < 0.3 ? 1 + Math.floor(random() * 4) : null,
      });
      const reaction = Math.floor(random() * 4);
      const c: [number, number, number] = [1 + Math.round(random() * 50) / 100, 1 + Math.round(random() * 50) / 100, 1 + Math.round(random() * 50) / 100];
      const rest = Math.floor(random() * 25);
      const s = { ...sheet(reaction), thisCoefficient: c[0], nextCoefficient: c[1], secondCoefficient: c[2] };
      // + 0 — старый код оставлял -0 после Math.round, число то же
      expect(planFor(it, s, rest) + 0, JSON.stringify({ it, reaction, c, rest })).toBe(legacyPlan(it, reaction, c, rest) + 0);
    }
  });

  it("не опускает витрину ниже минимума и считает сэндвичи целыми булками", () => {
    // сейчас не считаем (реакция 0) — только добираем до минимума витрины
    expect(planFor(item({ minShowCase: 4 }), sheet(0), 1)).toBe(3);
    expect(roundToBuns(7, 2)).toBe(8);
    // остаток 1 из 3 — уже треть булки, добавляем булку; 1 из 4 — нет
    expect(roundToBuns(7, 3)).toBe(9);
    expect(roundToBuns(9, 4)).toBe(8);
    expect(bunsFor(7, 3)).toBe(3);
    expect(formatDuration(40)).toBe("40 мин");
    expect(formatDuration(150)).toBe("2,5 ч");
  });
});

describe("строки и итог", () => {
  it("любое значение идёт в работу как ввели: факт, а без него план", () => {
    const croissant = item();
    const s = sheet(2, [croissant]);

    const huge = buildRow(croissant, s, { ...EMPTY_ENTRY, rest: "100" });
    expect(huge.taken).toBe(huge.plan);
    expect(buildRow(croissant, s, { ...EMPTY_ENTRY, rest: "3", fact: "500" }).taken).toBe(500);
    expect(buildRow(croissant, s, { ...EMPTY_ENTRY, rest: "3", fact: "0" }).taken).toBe(0);
    expect(buildRow(croissant, s).taken).toBeNull();
  });

  it("сохранённый план показываем как есть, пока остаток не поменяли", () => {
    const croissant = item();
    const s = sheet(2, [croissant]);
    const logged = { ...EMPTY_ENTRY, rest: "3", loggedRest: "3", loggedPlan: 42 };

    expect(buildRow(croissant, s, logged).plan).toBe(42);
    expect(buildRow(croissant, s, { ...logged, rest: "4" }).plan).toBe(planFor(croissant, s, 4));
  });

  it("итог: сколько введено, план, факт и булки", () => {
    const croissant = item({ rkCode: 1 });
    const sandwich = item({ rkCode: 2, bunsPer: 2 });
    const empty = item({ rkCode: 3 });
    const s = sheet(2, [croissant, sandwich, empty]);
    const rows = [
      buildRow(croissant, s, { ...EMPTY_ENTRY, rest: "3", fact: "2" }),
      buildRow(sandwich, s, { ...EMPTY_ENTRY, rest: "0", fact: "7" }),
      buildRow(empty, s),
    ];

    const summary = buildSummary(rows);

    expect(summary).toEqual({ total: 3, entered: 2, plan: rows[0].plan! + rows[1].plan!, taken: 9, buns: 4 });
  });
});
