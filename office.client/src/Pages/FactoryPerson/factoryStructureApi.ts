import { ApiError, del, get, getFriendlyErrorMessage, post } from "../../Services/api";

export type FactoryDictionaryItem = { id: number; name: string };

export type FactoryCombination = {
  departmentId: number;
  departmentName: string;
  workshopId: number;
  workshopName: string;
  jobTitleId: number;
  jobTitleName: string;
  activePersons: number;
};

export type FactoryStructure = {
  departments: FactoryDictionaryItem[];
  workshops: FactoryDictionaryItem[];
  jobTitles: FactoryDictionaryItem[];
  combinations: FactoryCombination[];
};

/** Существующая запись справочника (id) или новая (name). */
export type FactoryDictionaryRef = { id: number } | { name: string };

export const getFactoryStructure = () => get<FactoryStructure>("/FactoryStructure");

export const createFactoryCombination = (body: {
  department: FactoryDictionaryRef;
  workshop: FactoryDictionaryRef;
  jobTitle: FactoryDictionaryRef;
}) => post<void>("/FactoryStructure/combinations", body);

export const deleteFactoryCombination = (item: FactoryCombination) =>
  del<void>(
    `/FactoryStructure/combinations?department=${item.departmentId}&workshop=${item.workshopId}&jobTitle=${item.jobTitleId}`,
  );

const SERVER_MESSAGE_STATUSES = new Set([400, 404, 409]);

/** Сервер формулирует ошибки для пользователя — показываем их вместо общих текстов по HTTP-коду. */
export function getFactoryStructureErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof ApiError
    && error.status
    && SERVER_MESSAGE_STATUSES.has(error.status)
    && error.message
    && !error.message.startsWith("Request failed")
  ) {
    return error.message;
  }

  return getFriendlyErrorMessage(error, fallback);
}

export type FactoryDictionaryKind =
  | "entities"
  | "documentTypes"
  | "citizenshipTypes"
  | "citizenships"
  | "banks";

export type FactoryDictionaryRow = {
  id: number;
  name: string;
  /** Сколько сотрудников (для типа гражданства — гражданств) ссылается на значение. */
  usage: number;
  /** Только для гражданств: тип гражданства. */
  parentId: number | null;
  parentName: string | null;
};

export const getFactoryDictionary = (kind: FactoryDictionaryKind) =>
  get<FactoryDictionaryRow[]>(`/FactoryDictionaries/${kind}`);

export const createFactoryDictionaryItem = (kind: FactoryDictionaryKind, body: { name: string; parentId?: number }) =>
  post<{ id: number; name: string }>(`/FactoryDictionaries/${kind}`, body);

export const deleteFactoryDictionaryItem = (kind: FactoryDictionaryKind, id: number) =>
  del<void>(`/FactoryDictionaries/${kind}/${id}`);
