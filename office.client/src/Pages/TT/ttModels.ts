export type TTListItem = {
  id: string;
  name: string;
  type: string;
  rkCode: number | null;
  aggregatorsCode: number | null;
  obd: number | null;
  address: string | null;
  openDate: string | null;
  closeDate: string | null;
  isClosed: boolean;
};

export type EntityListItem = {
  id: string;
  name: string;
  owner: number;
  locationsCount: number;
};

export type JobTitleListItem = {
  id: string;
  name: string;
  sequence: number | null;
};

export type LocationTypeListItem = {
  id: string;
  name: string;
  locationsCount: number;
};

/** Ключ вкладки хранится в адресе (/TT?tab=factory), чтобы после редактирования вернуться на неё. */
export const ttTabs = [
  { key: "trade", label: "Торговые точки" },
  { key: "factory", label: "Завод" },
  { key: "office", label: "Офис" },
  { key: "entities", label: "Организации" },
  { key: "jobtitles", label: "Должность" },
  { key: "types", label: "Типы" },
] as const;
