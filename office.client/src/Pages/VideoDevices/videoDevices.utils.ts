import type { Device, DeviceActionState, DeviceFormState, DeviceHealth, DevicePresence, FilterState, ScopeFilter, SortMode, StatusFilter } from "./videoDevices.types";

export const FILTER_STORAGE_KEY = "videoDevices.filters";
export const SORT_STORAGE_KEY = "videoDevices.sortMode";
export const ADB_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
/** Приставки шлют сигнал раз в 2 минуты; страница обновляет статусы раз в минуту. */
export const PRESENCE_REFRESH_MS = 60 * 1000;

export const emptyForm: DeviceFormState = {
  locationGuid: "",
  ip: "",
  videoNames: [],
  contentType: "video",
  customAds: "",
  muteStartTime: "",
  muteEndTime: "",
};

export const DEFAULT_FILTERS: FilterState = { scope: "all", status: "all" };

const SCOPES: readonly ScopeFilter[] = ["all", "video", "music", "test"];
const STATUSES: readonly StatusFilter[] = ["all", "working", "noSignal", "attention", "urgent", "outdated"];

export function readStoredFilters(): FilterState {
  try {
    const raw = localStorage.getItem(FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.scope === "string" || typeof parsed.status === "string") {
      return {
        scope: SCOPES.includes(parsed.scope as ScopeFilter) ? (parsed.scope as ScopeFilter) : "all",
        status: STATUSES.includes(parsed.status as StatusFilter) ? (parsed.status as StatusFilter) : "all",
      };
    }
    // Старый формат (флажки video/music/test): переносим выбор точек, состояние сбрасываем
    const scope: ScopeFilter =
      parsed.test === true ? "test" : parsed.music === false ? "video" : parsed.video === false ? "music" : "all";
    return { scope, status: "all" };
  } catch {
    return DEFAULT_FILTERS;
  }
}

/** «только что», «4 мин», «2 ч 5 мин», «3 дн» — сколько прошло с момента [isoUtc]. */
export function formatSince(isoUtc: string, now: number = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - Date.parse(isoUtc)) / 1000));
  if (!Number.isFinite(seconds) || seconds < 60) return "только что";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} ч ${minutes % 60} мин` : `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}

export type PresenceView = {
  /** neutral — нет связи, но это не неисправность (скорее всего, интернет на точке). */
  tone: "success" | "warning" | "danger" | "neutral";
  label: string;
  details: string;
};

/** Короткая подпись и подробности для карточки приставки по её сигналам. */
export function describePresence(presence: DevicePresence, now: number = Date.now()): PresenceView {
  const since = formatSince(presence.lastSeenUtc, now);
  const lastSeen = new Date(presence.lastSeenUtc).toLocaleString("ru-RU");
  if (presence.status === "offline") {
    const before = presence.problems.length > 0
      ? `Перед этим: ${presence.problems.join("; ")}`
      : presence.currentFile
        ? `Перед этим всё было в порядке, ${presence.mode === "music" ? "играло" : "на экране"}: ${presence.currentFile}`
        : "Перед этим всё было в порядке";
    const hint = presence.attention
      ? presence.problems.length > 0 ? "Требует внимания: связь пропала, когда уже была проблема" : "Требует внимания: связи нет больше суток"
      : "Скорее всего, пропал интернет на точке — приставка продолжает показывать то, что уже скачано";
    return {
      tone: presence.attention ? "danger" : "neutral",
      label: `Нет связи ${since}`,
      details: [`Последний сигнал: ${lastSeen}`, before, hint].join("\n"),
    };
  }

  const facts = [
    presence.currentFile ? `На экране: ${presence.currentFile}` : null,
    presence.itemsTotal > 0 ? `Файлов готово: ${presence.itemsReady} из ${presence.itemsTotal}` : null,
    presence.freeSpaceMb != null ? `Свободно: ${presence.freeSpaceMb} МБ` : null,
    `Сигнал: ${since === "только что" ? since : `${since} назад`}`,
  ].filter(Boolean);

  if (presence.status === "problem") {
    return {
      // Красный — контент не доходит до зрителя; жёлтый — работает, но деградирует
      tone: presence.severity === "critical" ? "danger" : "warning",
      label: shortProblem(presence.problems[0]),
      details: [...presence.problems, ...facts].join("\n"),
    };
  }

  return {
    tone: "success",
    label: presence.muted ? "Тишина" : "Показывает",
    details: (presence.muted ? ["Показывает, звук выключен по расписанию", ...facts] : facts).join("\n"),
  };
}

/** Короткая подпись для плашки; полный текст проблемы — в подсказке. */
export function shortProblem(problem?: string): string {
  if (!problem) return "Есть проблема";
  if (problem.startsWith("Экран")) return "Пустой экран";
  if (problem.startsWith("Звук выключен") || problem.startsWith("Звук идёт в HDMI")) return "Нет звука";
  if (problem.startsWith("Изображение зависло") || problem.startsWith("Музыка зависла")) return "Зависло";
  if (problem.startsWith("Музыка не играет")) return "Нет звука";
  if (problem.startsWith("Сломанных")) return "Битые файлы";
  if (problem.startsWith("Не получает настройки") || problem.startsWith("Давно не получала")) return "Нет настроек";
  if (problem.startsWith("Скачано")) return problem.split(" — ")[0];
  if (problem.startsWith("Не помещается") || problem.startsWith("Не хватает места")) return "Мало места";
  if (problem.startsWith("Перегрев")) return "Перегрев";
  if (problem.startsWith("Плеер зависал")) return "Зависает";
  if (problem.startsWith("Часы")) return "Сбиты часы";
  return problem.length > 22 ? `${problem.slice(0, 21)}…` : problem;
}

/** Сколько проблем — для пометки карточки: с двумя и больше карточка выделяется, на плашке «+N». */
export function problemCount(presence?: DevicePresence | null): number {
  return presence && presence.status !== "offline" ? presence.problems.length : 0;
}

/** «2 проблемы», «5 проблем», «21 проблема». */
export function problemsLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  const word = mod10 === 1 && mod100 !== 11 ? "проблема" : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? "проблемы" : "проблем";
  return `${count} ${word}`;
}

export type DiagnosticFact = {
  label: string;
  value: string;
  tone?: "warning" | "danger";
  /** Длинное значение (текст ошибки) — на всю ширину, с переносами. */
  wide?: boolean;
};

/** «40 с», «12 мин», «3 ч 5 мин», «2 дн» — длительность в секундах. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) return `${seconds} с`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} ч ${minutes % 60} мин` : `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}

function formatMb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1).replace(".", ",")} ГБ` : `${mb} МБ`;
}

function formatDateTime(isoUtc: string): string {
  return new Date(isoUtc).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Факты для окна диагностики. Поля, которых приставка не прислала (старая версия, прошивка), пропускаются. */
export function diagnosticFacts(presence: DevicePresence, now: number = Date.now()): DiagnosticFact[] {
  const facts: DiagnosticFact[] = [];
  const add = (label: string, value: string | null | undefined, tone?: DiagnosticFact["tone"], wide?: boolean) => {
    if (value) facts.push({ label, value, tone, wide });
  };

  add("Режим", presence.mode === "music" ? "Музыка" : presence.mode === "video" ? "Видео" : null);
  add(presence.mode === "music" ? "Играет" : "На экране", presence.currentFile);
  if (presence.itemsTotal > 0) {
    const broken = presence.brokenItems ? `, битых ${presence.brokenItems}` : "";
    add("Файлы", `готово ${presence.itemsReady} из ${presence.itemsTotal}${broken}`,
      presence.brokenItems ? "warning" : presence.itemsReady < presence.itemsTotal ? "warning" : undefined);
  }
  add("Настройки получены",
    presence.lastConfigOkUtc ? `${formatSince(presence.lastConfigOkUtc, now)} назад`.replace("только что назад", "только что") : "ещё не получены",
    presence.lastConfigOkUtc ? undefined : "warning");
  if (presence.stalledSeconds) {
    add("Воспроизведение", `стоит ${formatDuration(presence.stalledSeconds)}`, "danger");
  } else if (presence.freezesLastHour) {
    add("Воспроизведение", `зависало ${presence.freezesLastHour} раз(а) за час`, "warning");
  }
  if (presence.mode === "music" && presence.volumePercent != null) {
    const output =
      presence.audioOutput === "line" ? ", колонки" : presence.audioOutput === "hdmi" ? ", через телевизор" : "";
    const silent = presence.systemMuted || presence.volumePercent === 0;
    add("Звук", silent ? `выключен${output}` : `громкость ${presence.volumePercent}%${output}`,
      silent ? "danger" : presence.volumePercent < 20 ? "warning" : undefined);
  }
  if (presence.hdmiConnected != null) {
    // Музыке экран не нужен — отключённый HDMI там не ошибка
    const hdmiNeeded = presence.mode !== "music";
    add(
      "Экран (HDMI)",
      presence.hdmiConnected ? "подключён" : hdmiNeeded ? "не подключён" : "не подключён (для музыки не нужен)",
      presence.hdmiConnected || !hdmiNeeded ? undefined : "danger",
    );
  }
  if (presence.clockSkewSeconds != null) {
    const skew = presence.clockSkewSeconds;
    add("Часы", Math.abs(skew) < 60 ? "точные" : `${skew > 0 ? "спешат" : "отстают"} на ${formatDuration(Math.abs(skew))}`,
      Math.abs(skew) >= 300 ? "danger" : Math.abs(skew) >= 60 ? "warning" : undefined);
  }
  if (presence.networkType) {
    const network =
      presence.networkType === "ethernet" ? "кабель" :
      presence.networkType === "wifi" ? `Wi-Fi${presence.wifiRssi != null ? `, ${presence.wifiRssi} дБм` : ""}` :
      presence.networkType === "none" ? "нет сети" : "другая";
    add("Сеть", network, presence.networkType === "wifi" && presence.wifiRssi != null && presence.wifiRssi <= -75 ? "warning" : undefined);
  }
  if (presence.downloadKbps != null) {
    const kbps = presence.downloadKbps;
    add("Скорость скачивания", kbps >= 1024 ? `${(kbps / 1024).toFixed(1).replace(".", ",")} МБ/с` : `${kbps} КБ/с`);
  }
  add("Портал", presence.portalHost);
  if (presence.freeSpaceMb != null) add("Свободно места", formatMb(presence.freeSpaceMb), presence.freeSpaceMb < 500 ? "danger" : undefined);
  if (presence.ramFreeMb != null) {
    // Общий объём — физический, если приставка его сообщила: прошивки-подделки завышают заявленный
    const total = presence.ramPhysicalMb || presence.ramTotalMb;
    add("Свободно ОЗУ", total ? `${formatMb(presence.ramFreeMb)} (из ${formatMb(total)})` : formatMb(presence.ramFreeMb));
  }
  if (presence.cpuTempC != null) add("Температура", `${presence.cpuTempC} °C`, presence.cpuTempC >= 85 ? "warning" : undefined);
  if (presence.bootedAtUtc) add("Включена", `${formatDateTime(presence.bootedAtUtc)} (${formatSince(presence.bootedAtUtc, now)} назад)`);
  if (presence.lastAutoRebootUtc) {
    add(
      "Сама перезагрузилась",
      `${formatDateTime(presence.lastAutoRebootUtc)} — ${presence.lastAutoRebootReason ?? "причина неизвестна"}`,
    );
  }
  if (presence.uptimeSeconds != null) add("Приложение работает", formatDuration(presence.uptimeSeconds));
  if (presence.hasRoot != null || presence.deviceOwner != null) {
    const rights = [presence.hasRoot ? "root" : null, presence.deviceOwner ? "владелец устройства" : null].filter(Boolean);
    add("Права", rights.length > 0 ? rights.join(", ") : "нет — только через ADB", rights.length > 0 ? undefined : "warning");
  }
  add("Версия", presence.appVersion);
  add("Последняя ошибка", presence.lastError, "warning", true);
  return facts;
}

/**
 * Итог по приставке: работает, просто нет связи, требует внимания или неизвестно.
 * Приложение 2.0+ — по сигналу. Старое приложение сигналов не шлёт — по проверке через 8080
 * (там «не отвечает» не отличить от «нет интернета», поэтому это сразу «внимание», как и раньше «ошибки»).
 */
export function deviceHealth(device: Device, actionState?: DeviceActionState): DeviceHealth {
  const presence = device.presence;
  if (presence) {
    if (presence.attention || presence.status === "problem") return "attention";
    return presence.status === "offline" ? "noSignal" : "working";
  }
  if (actionState?.status === "online") return "working";
  if (actionState?.status === "offline" || actionState?.status === "ping") return "attention";
  return "unknown";
}

/**
 * Связь с приставкой для кнопок и сортировки.
 * - Приложение 2.0 на связи — по его сигналу (он свежее любой давней ручной проверки), опрашивать не нужно.
 * - Сигнала нет — берём ручную проверку по 8080, если её делали: она отличит «приложение не запущено»
 *   (ping — можно запустить по ADB) от «приставка недоступна».
 * - Старое приложение — только проверка по 8080.
 */
export function connectionStatus(device: Device, actionState?: DeviceActionState): DeviceActionState["status"] {
  if (device.presence && device.presence.status !== "offline") return "online";
  if (actionState?.status) return actionState.status;
  return device.presence ? "offline" : undefined;
}

/** Старое приложение сигналов не шлёт — о нём узнаём только проверкой по 8080. */
export function needsPortCheck(device: Device): boolean {
  return !device.presence;
}

/**
 * Может ли приставка сама обновиться и перезагрузиться (без ADB): приложение 2.0+ с root или правами
 * владельца устройства. Сборки 2.0, которые ещё не сообщают о правах, считаются с root — так было на всех.
 */
export function canManageWithoutAdb(presence?: DevicePresence | null): boolean {
  return Boolean(presence) && (presence!.hasRoot !== false || presence!.deviceOwner === true);
}

/** Скриншот снимается через root. */
export function canScreenshot(presence?: DevicePresence | null): boolean {
  return presence?.hasRoot !== false;
}

/** Сколько ждать подтверждения обновления: скачать ~8 МБ, поставить, перезапуститься, прислать сигнал. */
export const UPDATE_CONFIRM_TIMEOUT_MS = 6 * 60 * 1000;

export type UpdateOutcome =
  | { state: "pending" }
  | { state: "done"; version: string }
  | { state: "failed"; message: string }
  | { state: "timeout" };

/**
 * Чем закончилось обновление командой. Успех — сигнал от приложения, запущенного уже после команды
 * (время запуска = время сигнала − сколько работает приложение). Ошибку приставка присылает как
 * «последнюю ошибку» с текстом «Обновление (…) не удалось».
 */
export function updateOutcome(startedAt: number, presence: DevicePresence | null | undefined, now: number = Date.now()): UpdateOutcome {
  if (presence) {
    const seenAt = Date.parse(presence.lastSeenUtc);
    if (seenAt > startedAt) {
      if (presence.uptimeSeconds != null && seenAt - presence.uptimeSeconds * 1000 >= startedAt - 5_000) {
        return { state: "done", version: presence.appVersion || "?" };
      }
      if (presence.lastError?.startsWith("Обновление")) {
        return { state: "failed", message: presence.lastError };
      }
    }
  }
  return now - startedAt > UPDATE_CONFIRM_TIMEOUT_MS ? { state: "timeout" } : { state: "pending" };
}

/** Срочно: контент не доходит до зрителя, или связи нет и перед этим уже было плохо / слишком долго. */
export function isUrgent(device: Device): boolean {
  return device.presence?.severity === "critical";
}

export function hasNoSignal(device: Device): boolean {
  return device.presence?.status === "offline";
}

/** Точка попадает в выбранный набор: розница целиком, розница с видео или с музыкой, либо тестовые. */
export function matchesScope(device: Device, scope: ScopeFilter): boolean {
  if (scope === "test") return device.isTestLocation;
  if (device.isTestLocation) return false;
  const hasVideo = device.onlyMusic === null || device.onlyMusic === undefined || device.onlyMusic === 0;
  const hasMusic = device.onlyMusic === 1 || device.onlyMusic === 0;
  return scope === "all" || (scope === "video" && hasVideo) || (scope === "music" && hasMusic);
}

/** Совпадает с плиткой-счётчиком: что попало в число на плитке, то и показывается в списке. */
export function matchesStatus(
  device: Device,
  status: StatusFilter,
  actionState: DeviceActionState | undefined,
  serverVersion: string,
): boolean {
  switch (status) {
    case "all":
      return true;
    case "urgent":
      return isUrgent(device);
    case "outdated":
      return isOutdatedVersion(device.version, serverVersion);
    default:
      return deviceHealth(device, actionState) === status;
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

/** Версия приставки старше серверной — её нужно обновить. Более новая (тестовая) — не «устаревшая». */
export function isOutdatedVersion(version?: string | null, serverVersion?: string | null) {
  return Boolean(version && serverVersion && compareVersions(version, serverVersion) < 0);
}

export function isNewerVersion(version?: string | null, serverVersion?: string | null) {
  return Boolean(version && serverVersion && compareVersions(version, serverVersion) > 0);
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
