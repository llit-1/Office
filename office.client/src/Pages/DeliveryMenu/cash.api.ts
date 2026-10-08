import { del, get, post } from "../../Services/api";

export interface CashLocation { guid: string; name: string }
export const getCashLocations = () => get<CashLocation[]>("/Cash/locations");
export const sendCashMessage = (location: string, message: string) => post<void>("/Cash/messages", { location, message });

/** Версия дистрибутива кассового клиента. Кассы по умолчанию ставят самую свежую актуальную. */
export interface CashVersion {
  id: number;
  version: string;
  actual: boolean;
  createdAt: string | null;
  size: number | null;
}

export const getCashVersions = () => get<CashVersion[]>("/Cash/versions");

/**
 * Новая версия сразу помечается actual: её получают новые кассы и обновления без явной версии.
 * Уже работающим кассам задачи сама загрузка не ставит — это «Установить на все кассы».
 */
export const addCashVersion = (version: string, file: File) => {
  const body = new FormData();
  body.append("version", version);
  body.append("actual", "true");
  body.append("file", file);
  return post<void>("/Cash/versions", body, { headers: { "Content-Type": "multipart/form-data" } });
};

export const deleteCashVersion = (id: number) => del<void>(`/Cash/versions/${id}`);

export const downloadCashVersion = (id: number) =>
  get<Blob>(`/Cash/versions/${id}/download`, { responseType: "blob" });

/**
 * Касса с установленным клиентом. yeapi присылает установленную версию как id из списка версий
 * (`cashVersionId`); `cashVersion` заполнен, только если сервис прислал номер строкой.
 */
export interface CashClient {
  id: number;
  name: string | null;
  locationGuid: string | null;
  ip: string | null;
  midServer: number | null;
  cashVersionId?: number | null;
  cashVersion: string | null;
  lastConnection: string | null;
}

export const getCashClients = () => get<CashClient[]>("/Cash/clients");

/**
 * Текущая задача кассы: тип (Install/Update/Delete) и последний выполненный этап (`Created` — ещё не начата).
 * yeapi отдаёт только незавершённые задачи; `updatedAt` — время последней смены этапа.
 */
export interface CashTask {
  cashId: number;
  id: number;
  type: string | null;
  stage: string | null;
  versionId: number | null;
  updatedAt: string | null;
}

export const getCashTasks = () => get<CashTask[]>("/Cash/clients/tasks");

/** Результат постановки задач на установку: раскатка может пройти не на всех кассах. */
export interface CashInstallResult { total: number; queued: number; failed: string[] }

export const installCashVersion = (id: number) => post<CashInstallResult>(`/Cash/versions/${id}/install`);

/** Задача на обновление одной кассе — из её карточки. Без версии касса ставит самую свежую. */
export const installOnCashClient = (cashId: number, versionId?: number) =>
  post<void>(`/Cash/clients/${cashId}/install`, undefined, versionId ? { params: { versionId } } : undefined);

/** Задача на полное удаление кассового клиента с компьютера. */
export const deleteCashClient = (cashId: number) => post<void>(`/Cash/clients/${cashId}/delete`);
