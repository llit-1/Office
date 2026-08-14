import { getOfficeViewerFormat } from "../../Components/OfficeViewer/officeFormats";

const previewImages = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".svg", ".tif", ".tiff"]);
const previewVideos = new Set([".mp4", ".mov", ".m4v", ".webm"]);
// Форматы, которые умеет открывать публичный Office Online Viewer (Word и Excel, включая старые бинарные).
// CSV/текстовые файлы туда не годятся — это не настоящие офисные документы, для них остаётся свой просмотрщик.
const officeOnlineFormats = new Set([
  ".xlsx", ".xlsm", ".xltx", ".xls", ".xlt",
  ".docx", ".docm", ".dotx", ".doc", ".dot",
]);

// В списках теперь показываем только PDF, Word и Excel — остальные форматы (включая SVG, которые
// теперь используются как иконки папок) из обзора и поиска скрыты.
const visibleFileExtensions = new Set([".pdf", ".doc", ".docx", ".docm", ".xls", ".xlsx", ".xlsm"]);

export function isKnowledgeVisibleFile(extension: string) {
  return visibleFileExtensions.has(extension.toLowerCase());
}

export type KnowledgePreviewType = "pdf" | "image" | "video" | "office" | "office-online" | "download";

export function getKnowledgePreviewType(extension: string): KnowledgePreviewType {
  const normalized = extension.toLowerCase();
  if (normalized === ".pdf") return "pdf";
  if (previewImages.has(normalized)) return "image";
  if (previewVideos.has(normalized)) return "video";
  if (officeOnlineFormats.has(normalized)) return "office-online";
  if (getOfficeViewerFormat(normalized)) return "office";
  return "download";
}

export function getParentKnowledgePath(relativePath: string) {
  const parts = relativePath.replace(/\\/g, "/").split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}

/** Сегменты пути к папке, содержащей элемент (без имени самого элемента). */
export function getKnowledgePathSegments(relativePath: string) {
  const parent = getParentKnowledgePath(relativePath);
  return parent ? parent.split("/").filter(Boolean) : [];
}

export function getKnowledgeBreadcrumbs(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.map((label, index) => ({ label, path: parts.slice(0, index + 1).join("/") }));
}

export function getKnowledgeLibraryHref(sectionId?: string | null, path?: string) {
  if (!sectionId) return "/KnowledgeLibrary";
  const params = new URLSearchParams({ section: sectionId });
  if (path) params.set("path", path);
  return `/KnowledgeLibrary?${params.toString()}`;
}

export function formatKnowledgeFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} КБ`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
  return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`;
}

export function formatKnowledgeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Ссылка «назад» для стрелки в шапке: папка -> родитель -> список разделов -> главная. */
export function getKnowledgeBackPath(sectionId: string | null, currentPath: string) {
  if (!sectionId) return "/Main";
  if (!currentPath) return "/KnowledgeLibrary";
  const parent = getParentKnowledgePath(currentPath);
  const params = new URLSearchParams({ section: sectionId });
  if (parent) params.set("path", parent);
  return `/KnowledgeLibrary?${params.toString()}`;
}
