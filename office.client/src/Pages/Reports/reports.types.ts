export type ReportKind = "powerBi" | "external" | "files" | "franchisee";

export type ReportCatalogItem = {
  code: string;
  title: string;
  description: string;
  kind: ReportKind;
  configured: boolean;
  url: string | null;
};

export type ReportCatalog = {
  reports: ReportCatalogItem[];
  canManage: boolean;
};

export type ReportLink = {
  code: string;
  title: string;
  url: string;
};

export type ReportFileEntry = {
  name: string;
  path: string;
  extension: string;
  size: number;
  modifiedAt: string;
};

export type ReportFiles = {
  entries: ReportFileEntry[];
};

export type ReportLocation = {
  guid: string;
  name: string;
};

export type FranchiseeReportDefinition = {
  code: string;
  title: string;
  description: string;
  usesPeriod: boolean;
  uses1C: boolean;
};

export type FranchiseeLookups = {
  locations: ReportLocation[];
  reports: FranchiseeReportDefinition[];
  maxPeriodDays: number;
};

export type ReportColumnType = "text" | "number" | "money" | "datetime";

export type ReportColumn = {
  key: string;
  label: string;
  type: ReportColumnType;
};

export type ReportCellValue = string | number | null;

export type ReportTable = {
  code: string;
  title: string;
  locationName: string;
  from: string | null;
  to: string | null;
  columns: ReportColumn[];
  rows: Array<Record<string, ReportCellValue>>;
};

export type ReportSetting = {
  code: string;
  title: string;
  kind: ReportKind;
  value: string;
  defaultValue: string | null;
};

export type ReportSettings = {
  common: ReportSetting[];
};
