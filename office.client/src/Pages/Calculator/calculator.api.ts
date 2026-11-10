// Запросы раздела «Калькуляторы» к CalculatorController. Пользователь и его точки — по токену.
import { del, get, post } from "../../Services/api";
import type {
  CalculatorBlock,
  CalculatorEntry,
  CalculatorLocation,
  CalculatorSheet,
  CalculatorSlug,
} from "./calculator.types";

export const getCalculatorLocations = () => get<CalculatorLocation[]>("/Calculator/locations");

export const getCalculatorSheet = (slug: CalculatorSlug, tt: number) =>
  get<CalculatorSheet>(`/Calculator/${slug}`, { params: { tt } });

export const saveCalculatorEntry = (slug: CalculatorSlug, entry: CalculatorEntry) =>
  post<{ savedAt: string }>(`/Calculator/${slug}/entries`, entry);

export const blockCalculatorItem = (slug: CalculatorSlug, tt: number, rkCode: number, rest: number) =>
  post<CalculatorBlock>(`/Calculator/${slug}/blocks`, { tt, rkCode, rest });

export const unblockCalculatorItem = (slug: CalculatorSlug, tt: number, rkCode: number) =>
  del<void>(`/Calculator/${slug}/blocks`, { params: { tt, rkCode } });
