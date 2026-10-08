import type { Declaration, DeclarationLookup, DeclarationPayload, DeclarationTnved, DeliveryItem } from "./deliveryMenu.types";

/** Длины колонок YEDeclaration в API. */
const MAX = { docNumber: 100, manufacturerName: 500, legalAddress: 1000, productionAddress: 1000, tnvedCodes: 100 };

// Номера деклараций пишут вперемешку латиницей и кириллицей («Д-RU.РА01» с латинской или русской «РА»),
// с пробелами и «№». Для сравнения приводим похожие буквы к кириллице и убираем пробелы.
const LATIN_TO_CYRILLIC: Record<string, string> = {
  A: "А", B: "В", C: "С", E: "Е", H: "Н", K: "К", M: "М", O: "О", P: "Р", T: "Т", X: "Х", Y: "У",
};

export function normalizeDocNumber(value: string) {
  return value
    .toUpperCase()
    .replace(/№/g, "N")
    .replace(/\s+/g, "")
    .replace(/[ABCEHKMOPTXY]/g, (letter) => LATIN_TO_CYRILLIC[letter]);
}

/** Коды ТН ВЭД сохранённой декларации: строка через запятую (на всякий случай понимаем и ; и пробелы). */
export function parseTnvedCodes(value: string | null | undefined): DeclarationTnved[] {
  return (value ?? "")
    .split(/[,;\s]+/)
    .map((code) => code.trim())
    .filter(Boolean)
    .map((code) => ({ code, name: null }));
}

/** Коды ТН ВЭД для выбора в карточке позиции — без пустых и повторов. */
export function tnvedOptions(codes: DeclarationTnved[] | null | undefined): DeclarationTnved[] {
  const seen = new Set<string>();
  return (codes ?? []).filter((item) => {
    const code = item.code?.trim();
    if (!code || seen.has(code)) return false;
    seen.add(code);
    return true;
  });
}

/**
 * Коды для сохранения в YEDeclaration.tnvedCodes (строка до 100 символов): через запятую, выбранный код первым.
 * Если все не помещаются, остаются только целые коды, которые влезли.
 */
export function joinTnvedCodes(codes: DeclarationTnved[], selected: string | null) {
  const list = tnvedOptions(codes).map((item) => item.code!.trim());
  const ordered = selected && list.includes(selected) ? [selected, ...list.filter((code) => code !== selected)] : list;
  let result = "";
  for (const code of ordered) {
    const next = result ? `${result},${code}` : code;
    if (next.length > MAX.tnvedCodes) break;
    result = next;
  }
  return result || null;
}

const clip = (value: string | null | undefined, max: number) => (value ?? "").trim().slice(0, max);

/** Декларация из реестра → тело POST /declarations. */
export function toDeclarationPayload(lookup: DeclarationLookup, selectedTnved: string | null): DeclarationPayload {
  const productionAddress = clip(lookup.productionAddress, MAX.productionAddress);
  return {
    docNumber: clip(lookup.docNumber, MAX.docNumber),
    fsaId: lookup.fsaId ?? null,
    dateFrom: lookup.dateFrom,
    dateTo: lookup.dateTo,
    manufacturerName: clip(lookup.manufacturerName, MAX.manufacturerName),
    legalAddress: clip(lookup.legalAddress, MAX.legalAddress),
    productionAddress: productionAddress || null,
    productName: lookup.productName?.trim() || null,
    tnvedCodes: joinTnvedCodes(lookup.tnvedCodes ?? [], selectedTnved),
  };
}

/** Выбранная в карточке декларация: из нашей базы (есть id) или найденная в реестре (сохранится вместе с позицией). */
export type DeclarationSelection =
  | { kind: "saved"; declaration: Declaration; expired: boolean }
  | { kind: "lookup"; declaration: DeclarationLookup };

export function selectionTnvedOptions(selection: DeclarationSelection | null): DeclarationTnved[] {
  if (!selection) return [];
  return tnvedOptions(selection.kind === "saved" ? parseTnvedCodes(selection.declaration.tnvedCodes) : selection.declaration.tnvedCodes);
}

export type DeclarationStatus = "none" | "valid" | "expired";

/**
 * Статус декларации позиции. /declarations/actual возвращает только действующие,
 * поэтому привязанная декларация, которой нет в этом списке, считается истёкшей.
 */
export function declarationStatus(item: Pick<DeliveryItem, "declaration">, actualIds: Set<number>): DeclarationStatus {
  if (item.declaration == null) return "none";
  return actualIds.has(item.declaration) ? "valid" : "expired";
}

export function formatDeclarationDate(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("ru-RU");
}

/** Поиск по списку действующих деклараций: номер (без учёта раскладки и пробелов), изготовитель, продукция. */
export function matchDeclarations(declarations: Declaration[], query: string) {
  const text = query.trim();
  if (!text) return declarations;
  const number = normalizeDocNumber(text);
  const lower = text.toLocaleLowerCase("ru-RU");
  return declarations.filter((declaration) =>
    normalizeDocNumber(declaration.docNumber).includes(number)
    || declaration.manufacturerName.toLocaleLowerCase("ru-RU").includes(lower)
    || (declaration.productName ?? "").toLocaleLowerCase("ru-RU").includes(lower));
}
