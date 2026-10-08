import { ApiError, get, getFriendlyErrorMessage, post, put } from "../../Services/api";

export type LocationGroup = "factory" | "office";

export type LookupItem = { guid: string; name: string };

export type LocationLookups = {
  types: LookupItem[];
  entities: LookupItem[];
  parents: LookupItem[];
};

export type LocationEditModel = {
  locationGuid: string;
  versionGuid: string;
  name: string;
  address: string | null;
  locationTypeGuid: string | null;
  entityGuid: string | null;
  parentGuid: string | null;
  latitude: number | null;
  longitude: number | null;
  versionStartDate: string | null;
  versionEndDate: string | null;
};

export type LocationSavePayload = {
  versionGuid: string | null;
  name: string;
  locationTypeGuid: string;
  entityGuid: string;
  parentGuid: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  versionStartDate: string | null;
  versionEndDate: string | null;
};

export type EntityEditModel = {
  id: string;
  name: string;
  owner: number;
  folderExists: boolean;
  folderAvailable: boolean;
  folderFileCount: number;
  folderPath: string | null;
};

export type EntitySavePayload = {
  name: string;
  owner: number;
  folder: boolean;
  confirmFolderDeletion: boolean;
};

export const getLocationLookups = (group: LocationGroup, exclude?: string) =>
  get<LocationLookups>(`/TT/locations/${group}/lookups`, { params: exclude ? { exclude } : undefined });

export const getLocation = (group: LocationGroup, guid: string) =>
  get<LocationEditModel>(`/TT/locations/${group}/${guid}`);

export const createLocation = (group: LocationGroup, payload: LocationSavePayload) =>
  post<{ locationGuid: string }>(`/TT/locations/${group}`, payload);

export const updateLocation = (group: LocationGroup, guid: string, payload: LocationSavePayload) =>
  put<void>(`/TT/locations/${group}/${guid}`, payload);

export const getEntity = (id: string) => get<EntityEditModel>(`/TT/entities/${id}`);

export const createEntity = (payload: EntitySavePayload) => post<{ id: string }>("/TT/entities", payload);

export const updateEntity = (id: string, payload: EntitySavePayload) => put<void>(`/TT/entities/${id}`, payload);

export const createJobTitle = (name: string) => post<{ id: string }>("/TT/jobtitles", { name });

export const updateJobTitle = (id: string, name: string) => put<void>(`/TT/jobtitles/${id}`, { name });

export const createLocationType = (name: string) => post<{ id: string }>("/TT/types", { name });

export const updateLocationType = (id: string, name: string) => put<void>(`/TT/types/${id}`, { name });

const SERVER_MESSAGE_STATUSES = new Set([400, 404, 409, 503]);

/** Сервер формулирует ошибки справочников для пользователя — показываем их вместо общих текстов по HTTP-коду. */
export function getTTErrorMessage(error: unknown, fallback: string): string {
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

/** Сервер просит подтвердить удаление папки организации, в которой есть файлы. */
export const isFolderNotEmptyError = (error: unknown) =>
  error instanceof ApiError
  && error.status === 409
  && (error.data as { code?: string } | undefined)?.code === "folder-not-empty";
