import api, { get, getAccessToken, getApiBaseUrl } from "../../Services/api";
import type {
  KnowledgeAdminSection,
  KnowledgeBrowse,
  KnowledgePersonalEntry,
  KnowledgeRole,
  KnowledgeSearchResult,
  KnowledgeSection,
  KnowledgeSectionPayload,
} from "./knowledgeLibrary.types";

export const getKnowledgeSections = () => get<KnowledgeSection[]>("/KnowledgeLibrary/sections");

export const browseKnowledgeSection = (sectionId: string, path: string) =>
  get<KnowledgeBrowse>(`/KnowledgeLibrary/sections/${sectionId}/entries`, { params: { path } });

export const searchKnowledgeSection = (sectionId: string, query: string) =>
  get<KnowledgeSearchResult>(`/KnowledgeLibrary/sections/${sectionId}/search`, { params: { query } });

export const getKnowledgeRecent = () => get<KnowledgePersonalEntry[]>("/KnowledgeLibrary/personal/recent");

export const getKnowledgeFavorites = () => get<KnowledgePersonalEntry[]>("/KnowledgeLibrary/personal/favorites");

export const addKnowledgeFavorite = (sectionId: string, documentId: string) =>
  api.post(`/KnowledgeLibrary/sections/${sectionId}/documents/${documentId}/favorite`);

export const removeKnowledgeFavorite = (sectionId: string, documentId: string) =>
  api.delete(`/KnowledgeLibrary/sections/${sectionId}/documents/${documentId}/favorite`);

export const getKnowledgeAdminSections = () =>
  get<KnowledgeAdminSection[]>("/KnowledgeLibrary/admin/sections");

export const getKnowledgeRoles = () => get<KnowledgeRole[]>("/KnowledgeLibrary/admin/roles");

function toFormData(payload: KnowledgeSectionPayload) {
  const data = new FormData();
  data.append("Title", payload.title);
  data.append("Description", payload.description);
  data.append("RootPath", payload.rootPath);
  data.append("IsActive", String(payload.isActive));
  data.append("AvailableToAll", String(payload.availableToAll));
  data.append("SortOrder", String(payload.sortOrder));
  payload.roleIds.forEach((id) => data.append("RoleIds", String(id)));
  if (payload.cover) data.append("Cover", payload.cover);
  return data;
}

export async function createKnowledgeSection(payload: KnowledgeSectionPayload) {
  return await api.post<KnowledgeAdminSection>("/KnowledgeLibrary/admin/sections", toFormData(payload), {
    headers: { "Content-Type": "multipart/form-data" },
  }) as unknown as KnowledgeAdminSection;
}

export async function updateKnowledgeSection(id: string, payload: KnowledgeSectionPayload) {
  return await api.put<KnowledgeAdminSection>(`/KnowledgeLibrary/admin/sections/${id}`, toFormData(payload), {
    headers: { "Content-Type": "multipart/form-data" },
  }) as unknown as KnowledgeAdminSection;
}

export const deleteKnowledgeSection = (id: string) => api.delete(`/KnowledgeLibrary/admin/sections/${id}`);
export const reindexKnowledgeSection = (id: string) => api.post(`/KnowledgeLibrary/admin/sections/${id}/reindex`);
export const testKnowledgePath = (rootPath: string) =>
  api.post<{ message: string; normalizedPath: string }>("/KnowledgeLibrary/admin/test-path", { rootPath }) as unknown as Promise<{ message: string; normalizedPath: string }>;

export async function getKnowledgeMediaTicket(sectionId: string, documentId: string) {
  return await api.post<{ ticket: string }>(`/KnowledgeLibrary/sections/${sectionId}/documents/${documentId}/ticket`) as unknown as { ticket: string };
}

export function knowledgeMediaUrl(ticket: string, download = false, fileName?: string) {
  const base = String(getApiBaseUrl()).replace(/\/$/, "");
  const params = new URLSearchParams({ download: String(download) });
  const suffix = fileName ? `/${encodeURIComponent(fileName)}` : "";
  return `${base}/KnowledgeLibrary/media/${encodeURIComponent(ticket)}${suffix}?${params}`;
}

/**
 * Ссылка для встраивания файла в публичный Office Online Viewer.
 * knowledgeMediaUrl() может вернуть относительный путь (/api/...) — это нормально для <img>/<iframe>/axios,
 * они резолвят его сами относительно текущей страницы. Но серверам Microsoft резолвить не от чего,
 * поэтому здесь URL всегда достраивается до абсолютного через window.location.origin.
 * Требует, чтобы получившийся адрес был доступен из интернета (не localhost, не внутренняя сеть).
 */
export function knowledgeOnlineViewerUrl(ticket: string, fileName: string) {
  const fileUrl = new URL(knowledgeMediaUrl(ticket, false, fileName), window.location.origin).toString();
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}

export function knowledgeCoverUrl(sectionId: string) {
  const base = String(getApiBaseUrl()).replace(/\/$/, "");
  const token = getAccessToken();
  const params = new URLSearchParams();
  if (token) params.set("access_token", token);
  return `${base}/KnowledgeLibrary/sections/${sectionId}/cover?${params}`;
}

export function knowledgeFolderIconUrl(sectionId: string, documentId: string) {
  const base = String(getApiBaseUrl()).replace(/\/$/, "");
  const token = getAccessToken();
  const params = new URLSearchParams();
  if (token) params.set("access_token", token);
  return `${base}/KnowledgeLibrary/sections/${sectionId}/documents/${documentId}/folder-icon?${params}`;
}
