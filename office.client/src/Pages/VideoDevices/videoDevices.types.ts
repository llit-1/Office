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
  url?: string | null;
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

export type FilterState = {
  video: boolean;
  music: boolean;
  test: boolean;
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
  loading?: "check" | "screenshot" | "reload" | "startApp" | "updateApp";
  status?: "online" | "ping" | "offline";
  ok?: boolean;
  message?: string;
  versionFromDevice?: string;
};

export type DeviceStats = {
  total: number;
  online: number;
  errors: number;
  needUpdate: number;
};

export type BulkUpdateStatus = {
  state: "pending" | "updating" | "success" | "error";
  message?: string;
};
