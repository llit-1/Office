import { ApiError, get, getApiBaseUrl, getFriendlyErrorMessage, post, put } from "../../Services/api";
import type {
  FranchiseeLookups,
  ReportCatalog,
  ReportFiles,
  ReportLink,
  ReportSettings,
  ReportTable,
} from "./reports.types";

export const getReportCatalog = () => get<ReportCatalog>("/reports/catalog");

export const getReportLink = (code: string) => get<ReportLink>(`/reports/links/${encodeURIComponent(code)}`);

export const getReportFiles = () => get<ReportFiles>("/reports/files");

export const createReportFileTicket = (path: string) => post<{ ticket: string }>("/reports/files/ticket", { path });

/** Адрес файла по билету: iframe, img и video не умеют передавать токен авторизации. */
export const reportFileUrl = (ticket: string, fileName: string, download = false) =>
  `${getApiBaseUrl()}/reports/files/media/${ticket}/${encodeURIComponent(fileName)}${download ? "?download=true" : ""}`;

export const getFranchiseeLookups = () => get<FranchiseeLookups>("/reports/franchisee");

export const getFranchiseeReport = (code: string, params: { locationGuid: string; from?: string; to?: string }) =>
  get<ReportTable>(`/reports/franchisee/${encodeURIComponent(code)}`, { params });

export const getReportSettings = () => get<ReportSettings>("/reports/settings");

export const updateCommonReportSetting = (code: string, value: string) =>
  put<void>(`/reports/settings/common/${encodeURIComponent(code)}`, { value });

const SERVER_MESSAGE_STATUSES = new Set([400, 404, 409, 422, 503]);

/** Сервер формулирует ошибки отчётов для пользователя — показываем их вместо общих текстов по HTTP-коду. */
export function getReportErrorMessage(error: unknown, fallback: string): string {
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

export const isNotFoundError = (error: unknown) => error instanceof ApiError && error.status === 404;
