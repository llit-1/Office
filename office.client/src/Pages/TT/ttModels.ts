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
};

export type JobTitleListItem = {
  id: string;
  name: string;
  sequence: number | null;
};

export type LocationTypeListItem = {
  id: string;
  name: string;
};

export const ttTabs = [
  "Торговые точки",
  "Завод",
  "Офис",
  "Организации",
  "Должность",
  "Типы",
] as const;
