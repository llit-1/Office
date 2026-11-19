/** Статус приставки по её сигналам (приложение 2.0+ шлёт раз в 2 минуты). */
export type DevicePresence = {
  status: "playing" | "problem" | "offline";
  /**
   * Требует внимания: проблема на связи, или нет связи, а перед этим уже была проблема, или связи нет дольше суток.
   * Просто «нет связи» без этого — скорее всего, интернет на точке: приставка показывает то, что скачано.
   */
  attention?: boolean;
  /** critical — контент не доходит до зрителя (красный), warning — деградирует (жёлтый), null — в порядке / просто нет связи. */
  severity?: "critical" | "warning" | null;
  lastSeenUtc: string;
  problems: string[];
  lastError?: string | null;
  appVersion?: string | null;
  currentFile?: string | null;
  muted: boolean;
  itemsReady: number;
  itemsTotal: number;
  freeSpaceMb?: number | null;
  uptimeSeconds?: number | null;
  /** Замечания: на статус не влияют, видны в диагностике. */
  notices?: string[];
  mode?: "video" | "music" | null;
  brokenItems?: number;
  lastConfigOkUtc?: string | null;
  /** Расхождение часов приставки с сервером, секунды (+ — спешат). */
  clockSkewSeconds?: number | null;
  bootedAtUtc?: string | null;
  /** Последняя перезагрузка, которую приставка сделала сама, и её причина (текстом). */
  lastAutoRebootUtc?: string | null;
  lastAutoRebootReason?: string | null;
  networkType?: "ethernet" | "wifi" | "other" | "none" | null;
  wifiRssi?: number | null;
  downloadKbps?: number | null;
  portalHost?: string | null;
  hdmiConnected?: boolean | null;
  ramFreeMb?: number | null;
  ramTotalMb?: number | null;
  /** Физический объём памяти (по карте памяти ядра); прошивки-подделки завышают ramTotalMb. */
  ramPhysicalMb?: number | null;
  /** Сколько файлов приставка не скачала из-за нехватки места. */
  notEnoughSpaceItems?: number | null;
  cpuTempC?: number | null;
  /** Громкость музыки в системе приставки, 0–100. */
  volumePercent?: number | null;
  systemMuted?: boolean | null;
  /** Куда идёт звук: колонки (line), телевизор (hdmi) или как решит система. */
  audioOutput?: "line" | "hdmi" | "default" | null;
  /** Сколько секунд воспроизведение стоит на месте (завис декодер). */
  stalledSeconds?: number | null;
  /** Сколько раз за час приложение перезапускало зависший плеер. */
  freezesLastHour?: number | null;
  /** Есть root: обновление, перезагрузка и скриншот без ADB. */
  hasRoot?: boolean | null;
  /** Приложение — владелец устройства: обновление и перезагрузка без ADB и без root. */
  deviceOwner?: boolean | null;
};

export type DeviceCommand = "sync" | "redownload" | "reboot" | "volume" | "update" | "owner-release";

/** Обновление приложения командой (2.0+): ждём подтверждения по сигналу новой версии. */
export type PendingUpdate = {
  startedAt: number;
  apkName: string;
};

export type DevicePresenceItem = {
  deviceGuid: string;
  presence: DevicePresence;
};

export type Device = {
  guid: string;
  locationGuid?: string | null;
  locationName: string;
  ip: string;
  videoList: string;
  onlyMusic?: number | null;
  customAds?: string | null;
  muteStartTime?: string | null;
  muteEndTime?: string | null;
  version?: string | null;
  isTestLocation: boolean;
  /** null — сигналов нет (старое приложение): статус известен только по проверке через 8080. */
  presence?: DevicePresence | null;
};

export type DevicesResponse = {
  devices: Device[];
  serverVersion: string;
  usedVideoNames: string[];
};

export type VideoOption = {
  guid: string;
  name: string;
  position: number;
};

export type LocationOption = {
  guid: string;
  name: string;
};

export type FormDataResponse = {
  videos: VideoOption[];
  locations: LocationOption[];
  customAdsDirectories: string[];
  device?: Device | null;
};

export type VideoFile = {
  id: string;
  guid: string;
  position: number;
  name: string;
  sizeInMb: number;
  /** Тикет для <video src>: браузер не передаёт JWT в медиа-запросах. */
  previewTicket?: string | null;
};

export type ApkFile = {
  name: string;
  version: string;
  sizeInMb: number;
  updatedAt: string;
};

export type DeviceFormState = {
  locationGuid: string;
  ip: string;
  videoNames: string[];
  contentType: "video" | "music";
  customAds: string;
  muteStartTime: string;
  muteEndTime: string;
};

/** Какие точки показывать: вся розница, только с видео или с музыкой, или тестовые. */
export type ScopeFilter = "all" | "video" | "music" | "test";

/** Состояние приставок — выбирается нажатием на плитку со счётчиком. */
export type StatusFilter = "all" | "working" | "noSignal" | "attention" | "urgent" | "outdated";

export type FilterState = {
  scope: ScopeFilter;
  status: StatusFilter;
};

export type SortMode = "nameAsc" | "versionDesc" | "versionAsc" | "offlineFirst" | "onlineFirst";

export type DeviceCheckResponse = {
  ok: boolean;
  errorMessage?: string;
  status?: "online" | "ping" | "offline";
  serverVersion?: string;
  versionFromDevice?: string;
};

export type DeviceStatusStreamItem = DeviceCheckResponse & { guid: string; ip: string };

export type DeviceActionState = {
  loading?: "check" | "screenshot" | "reload" | "startApp" | "updateApp" | "grantOwner" | DeviceCommand;
  status?: "online" | "ping" | "offline";
  ok?: boolean;
  message?: string;
  versionFromDevice?: string;
};

export type DeviceStats = {
  total: number;
  /** Показывают контент (по сигналу) или отвечают на проверку (старое приложение). */
  working: number;
  /** Нет связи, но перед этим всё было в порядке и прошло меньше суток. */
  noSignal: number;
  attention: number;
  /** Срочные (красные): контент, скорее всего, не доходит до зрителя. */
  urgent: number;
  needUpdate: number;
};

/** Итоговое состояние приставки для счётчиков, цвета и фильтра. */
export type DeviceHealth = "working" | "noSignal" | "attention" | "unknown";

export type BulkUpdateStatus = {
  state: "pending" | "updating" | "success" | "error";
  message?: string;
};
