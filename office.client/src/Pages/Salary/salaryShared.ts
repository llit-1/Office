export type SalaryLocation = {
  guid: string;
  name: string;
  actual: number;
  rkCode?: number | null;
};

export type SalaryFiltersResponse = {
  locations: SalaryLocation[];
};

export type SalaryPersonalitySearchItem = {
  personalityVersionGuid: string;
  personalityGuid?: string | null;
  fio: string;
};

export type SalaryTimeSheet = {
  guid: string;
  personalityGuid: string;
  fio: string;
  location: string;
  position: string;
  locationGuid: string;
  begin: string;
  end: string;
  absence?: number | null;
  baseRate?: number | null;
  locationCashBonus?: number | null;
  experienceCashBonus?: number | null;
  personalCashBonus?: number | null;
  totalSalary?: number | null;
};

export type SalaryTimeSheetRefresh = {
  guid: string;
  begin: string;
  end: string;
  baseRate?: number | null;
  locationCashBonus?: number | null;
  experienceCashBonus?: number | null;
  personalCashBonus?: number | null;
  totalSalary?: number | null;
};

export type JobReference = {
  guid: string;
  name: string;
};

export type JobTitleItem = {
  guid: string;
  name: string;
  sequence?: number | null;
};

export type BaseRuleItem = {
  ruleId?: number | null;
  mainJob?: JobReference | null;
  realJob?: JobReference | null;
  bsm: string;
  bak: string;
  exk: string;
  begin: string;
  end: string;
  partTimer: boolean;
};

export type LocationReference = {
  rkCode?: number | null;
  name: string;
};

export type LocationRuleItem = {
  ruleId: number;
  location?: LocationReference | null;
  bam: number;
  begin: string;
  end: string;
};

export type ExperienceRuleItem = {
  ruleId: number;
  exPmin?: number | null;
  exPmax?: number | null;
  exM: number;
  begin: string;
  end: string;
};

export type SettingsListResponse<T> = {
  items: T[];
  loadError?: string | null;
};

export type SalarySettingsBaseResponse = {
  baseRules: BaseRuleItem[];
  loadError?: string | null;
  jobTitles: JobTitleItem[];
  locations: SalaryLocation[];
};

export type ProductionRuleItem = {
  category: string;
  duration: string;
  shifts: number;
  bonus: number;
  begin?: string | null;
  end?: string | null;
};

export type ProductionSettingsResponse = {
  items: ProductionRuleItem[];
  message: string;
};

export const formatMoney = (value?: number | null) => {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

export const formatDateTime = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ru-RU");
};

export const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU");
};

export const formatPeriod = (begin?: string | null, end?: string | null) => {
  return `${formatDate(begin)} - ${formatDate(end)}`;
};

export const calculateWorkedHours = (begin?: string | null, end?: string | null) => {
  if (!begin || !end) return 0;
  const beginDate = new Date(begin);
  const endDate = new Date(end);
  if (Number.isNaN(beginDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  const diffMs = endDate.getTime() - beginDate.getTime();
  if (diffMs <= 0) return 0;
  return diffMs / 3_600_000;
};

export const formatHours = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return value % 1 === 0 ? String(value) : value.toFixed(2);
};

export const isWarningRate = (value?: number | null) => {
  if (value == null) return true;
  return Number(value) === 0;
};

export const isStrictValidPeriod = (begin: string, end: string) => {
  return Boolean(begin) && Boolean(end) && begin < end;
};

export const getRangeDays = (begin: string, end: string) => {
  if (!begin || !end) return 0;
  const beginDate = new Date(`${begin}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(beginDate.getTime()) || Number.isNaN(endDate.getTime())) return 0;
  return Math.floor((endDate.getTime() - beginDate.getTime()) / 86_400_000);
};
