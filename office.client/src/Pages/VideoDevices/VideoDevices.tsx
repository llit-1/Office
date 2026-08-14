import { useEffect, useMemo, useState } from "react";
import { useNotifications } from "@toolpad/core";
import { useDispatch } from "react-redux";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import GenericTable, { type Column } from "../../Components/GenericTable/GenericTable";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Modal from "../../Components/Modal/Modal";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import { callApi, del, get, getAccessToken, getApiBaseUrl, post, put } from "../../Services/api";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import BulkUpdateModal from "./components/BulkUpdateModal";
import DeviceCard from "./components/DeviceCard";
import DeviceControls from "./components/DeviceControls";
import DeviceFormModal from "./components/DeviceFormModal";
import DeviceStatsCards from "./components/DeviceStatsCards";
import ReplaceVideoModal from "./components/ReplaceVideoModal";
import UpdateAppModal from "./components/UpdateAppModal";
import styles from "./VideoDevices.module.css";
import dashboard from "../../styles/entity-dashboard.module.css";
import type {
  ApkFile,
  BulkUpdateStatus,
  Device,
  DeviceActionState,
  DeviceCheckResponse,
  DeviceFormState,
  DevicesResponse,
  DeviceStatusStreamItem,
  FilterState,
  FormDataResponse,
  SortMode,
  VideoFile,
} from "./videoDevices.types";
import {
  ADB_REQUEST_TIMEOUT_MS,
  compareVersions,
  emptyForm,
  FILTER_STORAGE_KEY,
  getDeviceErrorMessage,
  normalizeDeviceIp,
  parseVideoNames,
  readStoredFilters,
  readStoredSortMode,
  SORT_STORAGE_KEY,
  toDeviceForm,
} from "./videoDevices.utils";

const VideoDevices = () => {
  const dispatch = useDispatch();
  const notifications = useNotifications();
  const [activeTab, setActiveTab] = useState(0);
  const [devices, setDevices] = useState<Device[]>([]);
  const [serverVersion, setServerVersion] = useState("");
  const [usedVideoNames, setUsedVideoNames] = useState<string[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [videosLoading, setVideosLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filters, setFilters] = useState<FilterState>(() => readStoredFilters());
  const [sortMode, setSortMode] = useState<SortMode>(() => readStoredSortMode());
  const [formData, setFormData] = useState<FormDataResponse | null>(null);
  const [formState, setFormState] = useState<DeviceFormState>(emptyForm);
  const [editingDeviceGuid, setEditingDeviceGuid] = useState<string | null>(null);
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [deleteGuid, setDeleteGuid] = useState<string | null>(null);
  const [replaceFromVideo, setReplaceFromVideo] = useState("");
  const [replaceToVideo, setReplaceToVideo] = useState("");
  const [apkFiles, setApkFiles] = useState<ApkFile[]>([]);
  const [apkFilesLoading, setApkFilesLoading] = useState(false);
  const [updateDevice, setUpdateDevice] = useState<Device | null>(null);
  const [selectedApkName, setSelectedApkName] = useState("");
  const [updatingApp, setUpdatingApp] = useState(false);
  const [bulkUpdateOpen, setBulkUpdateOpen] = useState(false);
  const [bulkSelectedGuids, setBulkSelectedGuids] = useState<string[]>([]);
  const [bulkSelectedApkName, setBulkSelectedApkName] = useState("");
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; deviceName?: string } | null>(null);
  const [bulkStatuses, setBulkStatuses] = useState<Record<string, BulkUpdateStatus>>({});
  const [saving, setSaving] = useState(false);
  const [deviceActions, setDeviceActions] = useState<Record<string, DeviceActionState>>({});
  const [screenshotModal, setScreenshotModal] = useState<{ ip: string; url: string } | null>(null);
  const [autoStatusStarted, setAutoStatusStarted] = useState(false);

  useEffect(() => {
    dispatch(pathSet({ path: "/Main" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Видео на ТТ" }));
  }, [dispatch]);

  useEffect(() => {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, sortMode);
  }, [sortMode]);

  const loadDevices = async () => {
    setDevicesLoading(true);
    const result = await callApi(get<DevicesResponse>("/VideoDevices/devices"), { notifications });
    if (result.ok) {
      setDevices(result.data.devices);
      setServerVersion(result.data.serverVersion);
      setUsedVideoNames(result.data.usedVideoNames);
      setAutoStatusStarted(false);
    }
    setDevicesLoading(false);
  };

  const loadVideos = async () => {
    setVideosLoading(true);
    const result = await callApi(get<Array<Omit<VideoFile, "id">>>("/VideoDevices/videos"), { notifications });
    if (result.ok) {
      setVideos(result.data.map((item) => ({ ...item, id: item.guid })));
    }
    setVideosLoading(false);
  };

  const loadApkFiles = async () => {
    setApkFilesLoading(true);
    const result = await callApi(get<ApkFile[]>("/VideoDevices/apks"), { notifications });
    if (result.ok) {
      setApkFiles(result.data);
      setSelectedApkName((current) => current || result.data[0]?.name || "");
      setBulkSelectedApkName((current) => current || result.data[0]?.name || "");
    }
    setApkFilesLoading(false);
  };

  useEffect(() => {
    loadDevices();
  }, []);

  useEffect(() => {
    if (devicesLoading || autoStatusStarted || devices.length === 0) return;

    setAutoStatusStarted(true);

    checkDevicesStatusBatch(devices);
  }, [autoStatusStarted, devices, devicesLoading]);

  useEffect(() => {
    if (activeTab === 1) {
      loadVideos();
    }
  }, [activeTab]);

  const filteredDevices = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();
    return devices.filter((device) => {
      const hasVideo = device.onlyMusic === null || device.onlyMusic === undefined || device.onlyMusic === 0;
      const hasMusic = device.onlyMusic === 1 || device.onlyMusic === 0;
      const matchesType = (filters.video && hasVideo) || (filters.music && hasMusic);
      const matchesTest = filters.test ? device.isTestLocation : !device.isTestLocation && matchesType;
      const matchesSearch =
        !normalizedSearch ||
        device.locationName.toLowerCase().includes(normalizedSearch) ||
        device.ip.toLowerCase().includes(normalizedSearch) ||
        parseVideoNames(device.videoList).join(" ").toLowerCase().includes(normalizedSearch);

      return matchesTest && matchesSearch;
    });
  }, [devices, filters, searchText]);

  const sortedDevices = useMemo(() => {
    return [...filteredDevices].sort((left, right) => {
      if (sortMode === "versionDesc") {
        return compareVersions(right.version, left.version);
      }

      if (sortMode === "versionAsc") {
        return compareVersions(left.version, right.version);
      }

      if (sortMode === "offlineFirst" || sortMode === "onlineFirst") {
        const leftStatus = deviceActions[left.guid]?.status;
        const rightStatus = deviceActions[right.guid]?.status;
        const statusPriority: Record<NonNullable<DeviceActionState["status"]>, number> =
          sortMode === "offlineFirst"
            ? { offline: 0, ping: 1, online: 2 }
            : { online: 0, ping: 1, offline: 2 };
        const unknownPriority = 3;
        const leftPriority = leftStatus ? statusPriority[leftStatus] : unknownPriority;
        const rightPriority = rightStatus ? statusPriority[rightStatus] : unknownPriority;
        return leftPriority - rightPriority;
      }

      return left.locationName.localeCompare(right.locationName, "ru", { sensitivity: "base" });
    });
  }, [deviceActions, filteredDevices, sortMode]);

  const counts = useMemo(
    () => ({
      video: devices.filter(
        (device) =>
          !device.isTestLocation &&
          (device.onlyMusic === null || device.onlyMusic === undefined || device.onlyMusic === 0),
      ).length,
      music: devices.filter((device) => !device.isTestLocation && (device.onlyMusic === 1 || device.onlyMusic === 0)).length,
      test: devices.filter((device) => device.isTestLocation).length,
    }),
    [devices],
  );

  const deviceStats = useMemo(() => {
    const retailDevices = devices.filter((device) => !device.isTestLocation);
    const statuses = retailDevices.map((device) => deviceActions[device.guid]?.status);
    const online = statuses.filter((status) => status === "online").length;
    const errors = statuses.filter((status) => status === "offline" || status === "ping").length;
    const needUpdate = retailDevices.filter(
      (device) => serverVersion && device.version && device.version !== serverVersion,
    ).length;

    return {
      total: retailDevices.length,
      online,
      errors,
      needUpdate,
    };
  }, [deviceActions, devices, serverVersion]);

  const outdatedDevices = useMemo(
    () =>
      devices.filter(
        (device) =>
          serverVersion &&
          device.version &&
          device.version !== serverVersion &&
          deviceActions[device.guid]?.status !== "offline",
      ),
    [deviceActions, devices, serverVersion],
  );

  const selectedBulkDevices = useMemo(
    () => outdatedDevices.filter((device) => bulkSelectedGuids.includes(device.guid)),
    [bulkSelectedGuids, outdatedDevices],
  );

  const openDeviceModal = async (device?: Device) => {
    const deviceGuid = device?.guid ?? null;
    setEditingDeviceGuid(deviceGuid);
    setFormState(toDeviceForm(device ?? null));
    setDeviceModalOpen(true);

    const result = await callApi(
      get<FormDataResponse>("/VideoDevices/form-data", { params: deviceGuid ? { deviceGuid } : undefined }),
      { notifications },
    );

    if (result.ok) {
      setFormData(result.data);
      if (result.data.device) {
        setFormState(toDeviceForm(result.data.device));
      }
    }
  };

  const closeDeviceModal = () => {
    setDeviceModalOpen(false);
    setEditingDeviceGuid(null);
    setFormData(null);
    setFormState(emptyForm);
  };

  const saveDevice = async () => {
    setSaving(true);
    const payload = {
      locationGuid: formState.locationGuid,
      ip: formState.ip,
      videoNames: formState.videoNames,
      contentType: formState.contentType === "music" ? 1 : null,
      customAds: formState.customAds || null,
      muteStartTime: formState.muteStartTime || null,
      muteEndTime: formState.muteEndTime || null,
    };

    const request = editingDeviceGuid
      ? put(`/VideoDevices/devices/${editingDeviceGuid}`, payload)
      : post("/VideoDevices/devices", payload);
    const result = await callApi(request, { notifications, successMessage: "Устройство сохранено" });
    setSaving(false);

    if (result.ok) {
      closeDeviceModal();
      await loadDevices();
    }
  };

  const deleteDevice = async () => {
    if (!deleteGuid) return;

    const result = await callApi(del(`/VideoDevices/devices/${deleteGuid}`), {
      notifications,
      successMessage: "Устройство удалено",
    });
    setDeleteGuid(null);

    if (result.ok) {
      closeDeviceModal();
      await loadDevices();
    }
  };

  const replaceVideo = async () => {
    const result = await callApi(
      post<{ updatedCount: number }>("/VideoDevices/replace-video", {
        fromVideo: replaceFromVideo,
        toVideo: replaceToVideo,
      }),
      { notifications },
    );

    if (result.ok) {
      notifications.show(`Обновлено устройств: ${result.data.updatedCount}`, {
        severity: "success",
        autoHideDuration: 3000,
      });
      setReplaceModalOpen(false);
      setReplaceFromVideo("");
      setReplaceToVideo("");
      await loadDevices();
    }
  };

  const updateVideoPosition = async (video: VideoFile, newPosition: number) => {
    const result = await callApi(
      post(`/VideoDevices/videos/${video.guid}/position`, { newPosition }),
      { notifications },
    );

    if (result.ok) {
      await loadVideos();
    }
  };

  const setDeviceActionState = (deviceGuid: string, state: DeviceActionState) => {
    setDeviceActions((current) => {
      const nextState = { ...current[deviceGuid], ...state };
      if (!("loading" in state)) {
        delete nextState.loading;
      }

      return { ...current, [deviceGuid]: nextState };
    });
  };

  const checkDevicesStatusBatch = async (devicesToCheck: Device[]) => {
    setDeviceActions((current) => {
      const nextState = { ...current };
      devicesToCheck.forEach((device) => {
        nextState[device.guid] = { ...nextState[device.guid], loading: "check" };
      });
      return nextState;
    });

    const pendingGuids = new Set(devicesToCheck.map((device) => device.guid));

    const applyDeviceStatus = (deviceStatus: DeviceStatusStreamItem) => {
      pendingGuids.delete(deviceStatus.guid);

      setDeviceActions((current) => {
        const nextState = {
          ...current[deviceStatus.guid],
          ok: deviceStatus.ok,
          status: deviceStatus.status ?? "offline",
          message: deviceStatus.status === "ping" ? "Есть ping" : deviceStatus.ok ? undefined : "Нет связи",
          versionFromDevice: deviceStatus.versionFromDevice,
        };
        delete nextState.loading;

        return { ...current, [deviceStatus.guid]: nextState };
      });

      if (deviceStatus.versionFromDevice) {
        setDevices((current) =>
          current.map((device) =>
            device.guid === deviceStatus.guid ? { ...device, version: deviceStatus.versionFromDevice } : device,
          ),
        );
      }
    };

    try {
      const apiBaseUrl = getApiBaseUrl().replace(/\/+$/, "");
      const token = getAccessToken();
      const response = await fetch(`${apiBaseUrl}/VideoDevices/devices/status/stream`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          devices: devicesToCheck.map((device) => ({
            guid: device.guid,
            ip: normalizeDeviceIp(device.ip),
          })),
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Не удалось проверить приставки");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        lines
          .map((line) => line.trim())
          .filter(Boolean)
          .forEach((line) => {
            applyDeviceStatus(JSON.parse(line) as DeviceStatusStreamItem);
          });

        if (done) break;
      }

      if (buffer.trim()) {
        applyDeviceStatus(JSON.parse(buffer) as DeviceStatusStreamItem);
      }
    } catch {
      setDeviceActions((current) => {
        const nextState = { ...current };
        devicesToCheck.filter((device) => pendingGuids.has(device.guid)).forEach((device) => {
          nextState[device.guid] = {
            ...nextState[device.guid],
            ok: false,
            status: "offline",
            message: "Не удалось проверить приставки",
          };
          delete nextState[device.guid].loading;
        });
        return nextState;
      });
    }
  };

  const checkDevice = async (device: Device, silent = false) => {
    const ip = normalizeDeviceIp(device.ip);
    setDeviceActionState(device.guid, { loading: "check" });
    const result = await callApi(
      post<DeviceCheckResponse>(silent ? "/VideoDevices/devices/status" : "/VideoDevices/devices/check", { ip }),
      undefined,
    );

    if (!result.ok) {
      setDeviceActionState(device.guid, { ok: false, status: "offline", message: "Нет связи" });
      return;
    }

    if (!result.data.ok) {
      setDeviceActionState(device.guid, {
        ok: false,
        status: result.data.status ?? "offline",
        message: result.data.status === "ping" ? "Есть ping" : "Нет связи",
      });
      return;
    }

    const status = result.data.status ?? "online";
    setDeviceActionState(device.guid, {
      ok: true,
      status,
      message: status === "ping" ? "Есть ping" : undefined,
      versionFromDevice: result.data.versionFromDevice,
    });
    setDevices((current) =>
      current.map((item) =>
        item.guid === device.guid ? { ...item, version: result.data.versionFromDevice ?? item.version } : item,
      ),
    );
  };

  const reloadDevice = async (device: Device) => {
    const ip = normalizeDeviceIp(device.ip);
    setDeviceActionState(device.guid, { loading: "reload" });
    const result = await callApi(
      post<{ ok: boolean; errorMessage?: string }>("/VideoDevices/devices/reload", { ip }),
      { notifications },
    );

    if (!result.ok || !result.data.ok) {
      const message = result.ok
        ? getDeviceErrorMessage(result.data.errorMessage, "Не удалось перезапустить приложение")
        : "Ошибка перезапуска";
      setDeviceActionState(device.guid, { ok: false, message });
      notifications.show(message, { severity: "error", autoHideDuration: 5000 });
      return;
    }

    setDeviceActionState(device.guid, { ok: true, message: "Перезапуск отправлен" });
    notifications.show("Команда перезапуска приложения отправлена", { severity: "success", autoHideDuration: 3000 });
  };

  const startDeviceApp = async (device: Device) => {
    const ip = normalizeDeviceIp(device.ip);
    setDeviceActionState(device.guid, { loading: "startApp" });
    const result = await callApi(
      post<{ ok: boolean; errorMessage?: string }>("/VideoDevices/devices/start-app", { ip }, { timeout: ADB_REQUEST_TIMEOUT_MS }),
      { notifications },
    );

    if (!result.ok || !result.data.ok) {
      const message = result.ok
        ? result.data.errorMessage || "Не удалось запустить приложение"
        : "Ошибка запуска приложения";
      setDeviceActionState(device.guid, { ok: false, status: "ping", message });
      notifications.show(message, { severity: "error", autoHideDuration: 5000 });
      return;
    }

    setDeviceActionState(device.guid, { ok: true, status: "ping", message: "Запуск приложения отправлен" });
    notifications.show("Команда запуска приложения отправлена", { severity: "success", autoHideDuration: 3000 });
    window.setTimeout(() => {
      void checkDevice(device, true);
    }, 2000);
  };

  const openUpdateAppModal = async (device: Device) => {
    setUpdateDevice(device);
    setSelectedApkName("");
    await loadApkFiles();
  };

  const closeUpdateAppModal = () => {
    if (updatingApp) return;
    setUpdateDevice(null);
    setSelectedApkName("");
  };

  const openBulkUpdateModal = async () => {
    setBulkSelectedGuids(outdatedDevices.map((device) => device.guid));
    setBulkSelectedApkName("");
    setBulkStatuses({});
    setBulkUpdateOpen(true);
    await loadApkFiles();
  };

  const closeBulkUpdateModal = () => {
    if (bulkUpdating) return;
    setBulkUpdateOpen(false);
    setBulkSelectedGuids([]);
    setBulkSelectedApkName("");
    setBulkProgress(null);
    setBulkStatuses({});
  };

  const toggleBulkDevice = (deviceGuid: string) => {
    setBulkSelectedGuids((current) =>
      current.includes(deviceGuid) ? current.filter((guid) => guid !== deviceGuid) : [...current, deviceGuid],
    );
  };

  const setAllBulkDevicesSelected = (selected: boolean) => {
    setBulkSelectedGuids(selected ? outdatedDevices.map((device) => device.guid) : []);
  };

  const bulkUpdateApps = async () => {
    if (!bulkSelectedApkName || selectedBulkDevices.length === 0) return;

    const devicesToUpdate = selectedBulkDevices;
    const failures: string[] = [];

    setBulkUpdating(true);
    setBulkProgress({ current: 0, total: devicesToUpdate.length });
    setBulkStatuses(
      Object.fromEntries(devicesToUpdate.map((device) => [device.guid, { state: "pending" as const, message: "Ожидает" }])),
    );

    for (const [index, device] of devicesToUpdate.entries()) {
      const ip = normalizeDeviceIp(device.ip);
      setBulkProgress({ current: index + 1, total: devicesToUpdate.length, deviceName: device.locationName });
      setBulkStatuses((current) => ({
        ...current,
        [device.guid]: { state: "updating", message: "Обновляется" },
      }));
      setDeviceActionState(device.guid, { loading: "updateApp" });

      const result = await callApi(
        post<{ ok: boolean; errorMessage?: string; version?: string }>("/VideoDevices/devices/update-app", {
          ip,
          apkName: bulkSelectedApkName,
        }, { timeout: ADB_REQUEST_TIMEOUT_MS }),
      );

      if (!result.ok || !result.data.ok) {
        const message = result.ok ? result.data.errorMessage || "Не удалось обновить приложение" : "Ошибка обновления приложения";
        failures.push(`${device.locationName}: ${message}`);
        setBulkStatuses((current) => ({
          ...current,
          [device.guid]: { state: "error", message },
        }));
        setDeviceActionState(device.guid, { ok: false, message });
        continue;
      }

      const nextVersion = result.data.version || bulkSelectedApkName.replace(/\.apk$/i, "");
      setDevices((current) =>
        current.map((item) => (item.guid === device.guid ? { ...item, version: nextVersion } : item)),
      );
      setBulkStatuses((current) => ({
        ...current,
        [device.guid]: { state: "success", message: "Обновлено" },
      }));
      setDeviceActionState(device.guid, { ok: true, status: "online", message: "Приложение обновлено" });
    }

    setBulkUpdating(false);
    setBulkProgress(null);

    if (failures.length > 0) {
      notifications.show(`Обновлено: ${devicesToUpdate.length - failures.length}, ошибок: ${failures.length}`, {
        severity: "warning",
        autoHideDuration: 7000,
      });
      return;
    }

    notifications.show(`Обновлено устройств: ${devicesToUpdate.length}`, { severity: "success", autoHideDuration: 5000 });
    setBulkUpdateOpen(false);
    setBulkSelectedGuids([]);
    setBulkSelectedApkName("");
  };

  const updateApp = async () => {
    if (!updateDevice || !selectedApkName) return;

    const ip = normalizeDeviceIp(updateDevice.ip);
    setUpdatingApp(true);
    setDeviceActionState(updateDevice.guid, { loading: "updateApp" });
    const result = await callApi(
      post<{ ok: boolean; errorMessage?: string; version?: string }>("/VideoDevices/devices/update-app", {
        ip,
        apkName: selectedApkName,
      }, { timeout: ADB_REQUEST_TIMEOUT_MS }),
      { notifications },
    );

    if (!result.ok || !result.data.ok) {
      const message = result.ok ? result.data.errorMessage || "Не удалось обновить приложение" : "Ошибка обновления приложения";
      setDeviceActionState(updateDevice.guid, { ok: false, message });
      notifications.show(message, { severity: "error", autoHideDuration: 6000 });
      setUpdatingApp(false);
      return;
    }

    const nextVersion = result.data.version || selectedApkName.replace(/\.apk$/i, "");
    setDevices((current) =>
      current.map((device) => (device.guid === updateDevice.guid ? { ...device, version: nextVersion } : device)),
    );
    setDeviceActionState(updateDevice.guid, { ok: true, status: "online", message: "Приложение обновлено" });
    notifications.show("Приложение обновлено и запущено", { severity: "success", autoHideDuration: 4000 });
    setUpdatingApp(false);
    setUpdateDevice(null);
    setSelectedApkName("");
    window.setTimeout(() => {
      void checkDevice(updateDevice, true);
    }, 2000);
  };

  const loadScreenshot = async (device: Device) => {
    const ip = normalizeDeviceIp(device.ip);
    setDeviceActionState(device.guid, { loading: "screenshot" });
    try {
      const blob = await get<Blob>("/VideoDevices/devices/screenshot", {
        params: { ip },
        responseType: "blob",
      });

      if (!blob.type.includes("image/")) {
        const text = await blob.text();
        let message = "Не удалось получить скриншот";
        try {
          const data = JSON.parse(text) as { message?: string; errorMessage?: string };
          message = data.message || data.errorMessage || message;
        } catch {
          if (text) message = text;
        }
        const readableMessage = getDeviceErrorMessage(message, "Не удалось получить скриншот");
        setDeviceActionState(device.guid, { ok: false, status: "offline", message: readableMessage });
        notifications.show(readableMessage, { severity: "error", autoHideDuration: 5000 });
        return;
      }

      const url = URL.createObjectURL(blob);
      setScreenshotModal((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return { ip, url };
      });
      setDeviceActionState(device.guid, { ok: true, message: "Скриншот получен" });
    } catch (error) {
      const message = getDeviceErrorMessage(
        error instanceof Error ? error.message : undefined,
        "Не удалось получить скриншот",
      );
      setDeviceActionState(device.guid, { ok: false, status: "offline", message });
      notifications.show(message, { severity: "error", autoHideDuration: 5000 });
    }
  };

  const closeScreenshotModal = () => {
    setScreenshotModal((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  };

  const videoColumns: Column<VideoFile>[] = [
    {
      label: "Позиция",
      render: (row) => (
        <select
          className={styles.positionSelect}
          value={row.position}
          onChange={(event) => updateVideoPosition(row, Number(event.target.value))}
          onClick={(event) => event.stopPropagation()}
        >
          {videos.map((_, index) => (
            <option key={index} value={index}>
              {index}
            </option>
          ))}
        </select>
      ),
      sortValue: (row) => row.position,
      filterValue: (row) => row.position,
      responsivePriority: 1,
    },
    { key: "name", label: "Название видео", responsivePriority: 2 },
    {
      label: "Размер",
      render: (row) => `${row.sizeInMb} Мб`,
      sortValue: (row) => row.sizeInMb,
      filterValue: (row) => row.sizeInMb,
      responsivePriority: 3,
    },
    {
      label: "Просмотр",
      render: (row) =>
        row.url ? (
          <video className={styles.videoPreview} controls preload="none" muted>
            <source src={row.url} />
          </video>
        ) : (
          ""
        ),
      responsivePriority: 4,
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <TabNavigation items={["Устройства", "Видео"]} activeIndex={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 0 && (
        <section className={dashboard.section}>
          <DeviceControls
            searchText={searchText}
            counts={counts}
            filters={filters}
            sortMode={sortMode}
            outdatedCount={outdatedDevices.length}
            onSearchTextChange={setSearchText}
            onFiltersChange={setFilters}
            onSortModeChange={setSortMode}
            onAddDevice={() => openDeviceModal()}
            onReplaceVideo={() => setReplaceModalOpen(true)}
            onBulkUpdate={openBulkUpdateModal}
          />

          <DeviceStatsCards stats={deviceStats} />

          {devicesLoading ? (
            <div className={styles.loader}>
              <LoadingSpinner size={96} label="Загружаем устройства…" />
            </div>
          ) : (
            <div className={dashboard.cardsGrid}>
              {sortedDevices.map((device) => (
                <DeviceCard
                  key={device.guid}
                  device={device}
                  serverVersion={serverVersion}
                  actionState={deviceActions[device.guid]}
                  onOpen={openDeviceModal}
                  onCheck={checkDevice}
                  onStartApp={startDeviceApp}
                  onUpdateApp={openUpdateAppModal}
                  onScreenshot={loadScreenshot}
                  onReload={reloadDevice}
                />
              ))}

              {sortedDevices.length === 0 && <div className={dashboard.emptyState}>По заданным фильтрам устройств нет</div>}
            </div>
          )}
        </section>
      )}

      {activeTab === 1 && (
        <GenericTable
          columns={videoColumns}
          data={videos}
          loading={videosLoading}
          addOption={false}
          tableStateKey="video-devices-videos"
          searchText={searchText}
          onSearchTextChange={setSearchText}
          highlightQuery={searchText}
          searchPlaceholder="Поиск видео..."
        />
      )}

      <DeviceFormModal
        isOpen={deviceModalOpen}
        editingDeviceGuid={editingDeviceGuid}
        formData={formData}
        formState={formState}
        saving={saving}
        onFormStateChange={setFormState}
        onDelete={setDeleteGuid}
        onClose={closeDeviceModal}
        onSave={saveDevice}
      />

      <ReplaceVideoModal
        isOpen={replaceModalOpen}
        usedVideoNames={usedVideoNames}
        replaceFromVideo={replaceFromVideo}
        replaceToVideo={replaceToVideo}
        onReplaceFromVideoChange={setReplaceFromVideo}
        onReplaceToVideoChange={setReplaceToVideo}
        onClose={() => setReplaceModalOpen(false)}
        onReplace={replaceVideo}
      />

      <UpdateAppModal
        device={updateDevice}
        apkFiles={apkFiles}
        selectedApkName={selectedApkName}
        apkFilesLoading={apkFilesLoading}
        updatingApp={updatingApp}
        onSelectedApkNameChange={setSelectedApkName}
        onClose={closeUpdateAppModal}
        onUpdate={updateApp}
      />

      <BulkUpdateModal
        isOpen={bulkUpdateOpen}
        outdatedDevices={outdatedDevices}
        selectedDevices={selectedBulkDevices}
        selectedGuids={bulkSelectedGuids}
        selectedApkName={bulkSelectedApkName}
        apkFiles={apkFiles}
        apkFilesLoading={apkFilesLoading}
        updating={bulkUpdating}
        progress={bulkProgress}
        statuses={bulkStatuses}
        serverVersion={serverVersion}
        onSelectedApkNameChange={setBulkSelectedApkName}
        onToggleDevice={toggleBulkDevice}
        onSelectAll={setAllBulkDevicesSelected}
        onClose={closeBulkUpdateModal}
        onUpdate={bulkUpdateApps}
      />

      <Modal
        isOpen={Boolean(screenshotModal)}
        onClose={closeScreenshotModal}
        title={screenshotModal ? `Скриншот ${screenshotModal.ip}` : "Скриншот"}
        size="lg"
        panelClassName={styles.screenshotPanel}
      >
        {screenshotModal && <img className={styles.screenshotImage} src={screenshotModal.url} alt={`Скриншот ${screenshotModal.ip}`} />}
      </Modal>

      <ConfirmModal
        isOpen={Boolean(deleteGuid)}
        title="Удалить устройство?"
        message="Устройство будет удалено из списка видео на ТТ."
        onCancel={() => setDeleteGuid(null)}
        onConfirm={deleteDevice}
        confirmLabel="Удалить"
        cancelLabel="Отмена"
      />
    </div>
  );
};

export default VideoDevices;
