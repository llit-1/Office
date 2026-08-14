import type { Device, DeviceFormState, FilterState, SortMode } from "./videoDevices.types";

export const FILTER_STORAGE_KEY = "videoDevices.filters";
export const SORT_STORAGE_KEY = "videoDevices.sortMode";
export const ADB_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;

export const emptyForm: DeviceFormState = {
  locationGuid: "",
  ip: "",
  videoNames: [],
  contentType: "video",
  customAds: "",
  muteStartTime: "",
  muteEndTime: "",
};

export function readStoredFilters(): FilterState {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return { video: true, music: true, test: false };
    const parsed = JSON.parse(raw) as Partial<FilterState>;
    return {
      video: parsed.video !== false,
      music: parsed.music !== false,
      test: parsed.test === true,
    };
  } catch {
    return { video: true, music: true, test: false };
  }
}

export function readStoredSortMode(): SortMode {
  try {
    const value = localStorage.getItem(SORT_STORAGE_KEY);
    return isSortMode(value) ? value : "nameAsc";
  } catch {
    return "nameAsc";
  }
}

function isSortMode(value: string | null): value is SortMode {
  return (
    value === "nameAsc" ||
    value === "versionDesc" ||
    value === "versionAsc" ||
    value === "offlineFirst" ||
    value === "onlineFirst"
  );
}

export function parseVideoNames(videoList: string) {
  return videoList
    .trim()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((item) => item.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

export function resolveSelectedVideoName(selectedVideoName: string | undefined, availableVideoNames: string[]) {
  const selected = selectedVideoName?.trim() ?? "";
  if (!selected) return "";

  const normalizedSelected = selected.toLocaleLowerCase();
  return availableVideoNames.find((name) => name.trim().toLocaleLowerCase() === normalizedSelected) ?? selected;
}

export function normalizeDeviceIp(ip: string) {
  return ip.trim().replace(/[\\/\s]+$/g, "");
}

export function compareVersions(left?: string | null, right?: string | null) {
  return (left || "").localeCompare(right || "", undefined, { numeric: true, sensitivity: "base" });
}

export function getDeviceErrorMessage(message: string | undefined, fallback: string) {
  if (!message) return fallback;

  if (message.includes("HttpClient.Timeout") || message.includes("request was canceled")) {
    const timeoutSeconds = message.match(/Timeout of (\d+) seconds/)?.[1];
    return timeoutSeconds ? `Нет ответа за ${timeoutSeconds} секунд.` : "Нет ответа за отведённое время.";
  }

  return message;
}

export function toDeviceForm(device: Device | null): DeviceFormState {
  if (!device) return emptyForm;

  return {
    locationGuid: device.locationGuid ?? "",
    ip: device.ip ?? "",
    videoNames: parseVideoNames(device.videoList),
    contentType: device.onlyMusic === 1 ? "music" : "video",
    customAds: device.customAds ?? "",
    muteStartTime: device.muteStartTime ?? "",
    muteEndTime: device.muteEndTime ?? "",
  };
}
