// Коды ролей совпадают с Office.Server/Reports/ReportRoles.cs.
export const REPORT_ROLES = {
  profit: "ReportsProfit",
  profitPro: "ReportsProfitPro",
  serviceDesk: "ReportsServiceDesk",
  checksTime: "ReportsChecksTime",
  franchisee: "ReportsFranchisee",
  other: "ReportsOther",
  oneC: "Reports1C",
  admin: "ReportsAdmin",
} as const;

export const reportRoles: string[] = Object.values(REPORT_ROLES);
