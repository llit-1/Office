import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNotifications } from "@toolpad/core";
import { useDispatch, useSelector } from "react-redux";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import { callApi, del, get, post, put } from "../../Services/api";
import type { RootState } from "../../Store";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import SensorChatsTab from "./components/SensorChatsTab";
import SensorEditModal from "./components/SensorEditModal";
import SensorRuleModal, { type RuleModalState } from "./components/SensorRuleModal";
import SensorRulesTab from "./components/SensorRulesTab";
import SensorsCardsTab from "./components/SensorsCardsTab";
import type {
  MaintenanceWindowItem,
  SensorFormState,
  SensorHistoryPoint,
  SensorRow,
  SensorRuleRow,
  SensorRuleSettings,
  SensorStatusFilter,
} from "./sensors.types";
import {
  defaultSensorFormState,
  defaultRuleSettingsFormState,
  getSensorStatus,
  normalizeHistory,
  oneTimeStartsAt,
  periodOptions,
  sensorStatusOrder,
  toApiTimeValue,
  toMaintenanceWindowFormState,
  toRuleSettingsFormState,
} from "./sensors.utils";
import styles from "./Sensors.module.css";

const SensorHistoryModal = lazy(() => import("./components/SensorHistoryModal"));

const emptyRuleModalState = (roomId = ""): RuleModalState => ({
  roomId,
  ...defaultRuleSettingsFormState,
  maintenanceWindows: [],
});

const SENSORS_REFRESH_MS = 60_000;

export default function Sensors() {
  const dispatch = useDispatch();
  const notifications = useNotifications();

  const roles = useSelector((state: RootState) => state.userData.roles);
  const isFullAccess = roles.includes("Sensors");
  const canEditRules = isFullAccess || roles.includes("SensorsEdit");
  const tabs = isFullAccess ? ["Датчики", "Правила", "Чаты"] : ["Датчики", "Правила"];

  const [activeTab, setActiveTab] = useState(0);
  const [sensors, setSensors] = useState<SensorRow[]>([]);
  const [ruleRows, setRuleRows] = useState<SensorRuleRow[]>([]);
  const [sensorsLoading, setSensorsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<SensorStatusFilter>("all");
  const [selectedSensor, setSelectedSensor] = useState<SensorRow | null>(null);
  const [editingSensor, setEditingSensor] = useState<SensorRow | null>(null);
  const [sensorModalMode, setSensorModalMode] = useState<"create" | "edit" | null>(null);
  const [sensorForm, setSensorForm] = useState<SensorFormState>(defaultSensorFormState);
  const [savingSensor, setSavingSensor] = useState(false);
  const [historyPeriodHours, setHistoryPeriodHours] = useState<(typeof periodOptions)[number]["hours"]>(24);
  const [historyPoints, setHistoryPoints] = useState<SensorHistoryPoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedSensorSettings, setSelectedSensorSettings] = useState<SensorRuleSettings | null>(null);
  const [selectedSensorMaintenanceWindows, setSelectedSensorMaintenanceWindows] = useState<MaintenanceWindowItem[]>([]);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleModalSaving, setRuleModalSaving] = useState(false);
  const [ruleDeleteConfirmOpen, setRuleDeleteConfirmOpen] = useState(false);
  const [ruleEditingSensor, setRuleEditingSensor] = useState<SensorRow | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleModalState>(emptyRuleModalState());
  const [initialMaintenanceWindows, setInitialMaintenanceWindows] = useState<MaintenanceWindowItem[]>([]);

  useEffect(() => {
    dispatch(pathSet({ path: "/Main" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Датчики" }));
  }, [dispatch]);

  const loadSensors = async () => {
    setSensorsLoading(true);

    const result = await callApi(get<SensorRow[]>("/Sensors/rooms"), { notifications });
    setSensorsLoading(false);

    if (!result.ok) {
      return false;
    }

    setSensors(result.data);
    return true;
  };

  const loadRuleRows = async () => {
    const result = await callApi(get<SensorRuleRow[]>("/Sensors/rules"), { notifications });
    if (!result.ok) {
      return false;
    }

    setRuleRows(result.data);
    return true;
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const [sensorsOk] = await Promise.all([loadSensors(), loadRuleRows()]);
      if (!sensorsOk && !cancelled) {
        setSensorsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [notifications]);

  // Статус датчика меняется со временем (задержка до уведомления), поэтому список тихо перечитываем раз в минуту.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void get<SensorRow[]>("/Sensors/rooms")
        .then((rows) => setSensors(rows))
        .catch(() => undefined);
    }, SENSORS_REFRESH_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!selectedSensor) {
      return;
    }

    let cancelled = false;

    const loadHistory = async () => {
      setHistoryLoading(true);
      const result = await callApi(
        get<SensorHistoryPoint[]>(`/Sensors/${selectedSensor.id}/history`, {
          params: { hours: historyPeriodHours },
        }),
        { notifications },
      );

      if (cancelled) {
        return;
      }

      setHistoryLoading(false);
      if (!result.ok) {
        return;
      }

      setHistoryPoints(result.data);
    };

    void loadHistory();

    return () => {
      cancelled = true;
    };
  }, [historyPeriodHours, notifications, selectedSensor]);

  useEffect(() => {
    if (!selectedSensor) {
      setSelectedSensorSettings(null);
      setSelectedSensorMaintenanceWindows([]);
      return;
    }

    let cancelled = false;

    const loadSettings = async () => {
      const [settingsResult, maintenanceWindowsResult] = await Promise.all([
        callApi(get<SensorRuleSettings>(`/Sensors/${selectedSensor.id}/settings`), { notifications }),
        callApi(
          get<MaintenanceWindowItem[]>(`/Sensors/${selectedSensor.id}/maintenance-windows`, {
            params: { includeDeleted: true },
          }),
          { notifications },
        ),
      ]);

      if (cancelled || !settingsResult.ok || !maintenanceWindowsResult.ok) {
        return;
      }

      setSelectedSensorSettings(settingsResult.data);
      setSelectedSensorMaintenanceWindows(maintenanceWindowsResult.data);
    };

    void loadSettings();

    return () => {
      cancelled = true;
    };
  }, [notifications, selectedSensor]);

  const filteredSensors = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return sensors
      .filter((sensor) => {
        const matchesStatus = statusFilter === "all" || getSensorStatus(sensor) === statusFilter;

        if (!matchesStatus) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return sensor.name.toLowerCase().includes(normalizedSearch) || sensor.ip.toLowerCase().includes(normalizedSearch);
      })
      .sort((left, right) => {
        const statusDiff = sensorStatusOrder[getSensorStatus(left)] - sensorStatusOrder[getSensorStatus(right)];

        if (statusDiff !== 0) {
          return statusDiff;
        }

        return left.id - right.id;
      });
  }, [searchText, sensors, statusFilter]);

  const normalizedHistory = useMemo(() => normalizeHistory(historyPoints), [historyPoints]);

  const openCreateModal = () => {
    setEditingSensor(null);
    setSensorModalMode("create");
    setSensorForm(defaultSensorFormState);
  };

  const openEditModal = (sensor: SensorRow) => {
    setEditingSensor(sensor);
    setSensorModalMode("edit");
    setSensorForm({
      name: sensor.name,
      ip: sensor.ip,
      isActive: sensor.actual !== 0,
    });
  };

  const closeSensorModal = () => {
    if (savingSensor) {
      return;
    }

    setSensorModalMode(null);
    setEditingSensor(null);
    setSensorForm(defaultSensorFormState);
  };

  const handleSaveSensor = async () => {
    if (!sensorModalMode || savingSensor) {
      return;
    }

    setSavingSensor(true);

    const payload = {
      name: sensorForm.name.trim(),
      ip: sensorForm.ip.trim(),
      actual: sensorForm.isActive ? 1 : 0,
    };

    const result =
      sensorModalMode === "create"
        ? await callApi(post<SensorRow>("/Sensors", payload), {
            notifications,
            successMessage: "Датчик добавлен",
          })
        : await callApi(put<SensorRow>(`/Sensors/${editingSensor?.id}`, payload), {
            notifications,
            successMessage: "Датчик сохранён",
          });

    setSavingSensor(false);

    if (!result.ok) {
      return;
    }

    closeSensorModal();
    await Promise.all([loadSensors(), loadRuleRows()]);
  };

  const canSaveSensor = sensorForm.name.trim().length > 0 && sensorForm.ip.trim().length > 0;

  const canSaveRule = useMemo(() => {
    if (!ruleForm.roomId) {
      return false;
    }

    if (
      ruleForm.violationDelayMinutes.trim().length === 0 ||
      ruleForm.repeatDelayMinutes.trim().length === 0 ||
      ruleForm.recoveryDelayMinutes.trim().length === 0
    ) {
      return false;
    }

    return ruleForm.maintenanceWindows.every((window) => {
      if (!window.name.trim() || !window.startTime.trim() || !window.endTime.trim()) {
        return false;
      }

      if (window.scheduleType === "weekly" && window.daysOfWeekMask < 1) {
        return false;
      }

      if (window.scheduleType === "one_time" && (!window.startDate || !window.endDate)) {
        return false;
      }

      if (window.scheduleType === "one_time" && window.id == null) {
        const startsAt = oneTimeStartsAt(window);
        if (startsAt == null || startsAt.getTime() < Date.now()) {
          return false;
        }
      }

      return true;
    });
  }, [ruleForm]);

  const closeRuleModal = () => {
    if (ruleModalSaving) {
      return;
    }

    setRuleModalOpen(false);
    setRuleDeleteConfirmOpen(false);
    setRuleEditingSensor(null);
    setRuleForm(emptyRuleModalState());
    setInitialMaintenanceWindows([]);
  };

  const openRuleModal = async (sensor: SensorRow) => {
    setRuleEditingSensor(sensor);
    setRuleDeleteConfirmOpen(false);
    setRuleModalOpen(true);

    const [settingsResult, maintenanceResult] = await Promise.all([
      callApi(get<SensorRuleSettings>(`/Sensors/${sensor.id}/settings`), { notifications }),
      callApi(get<MaintenanceWindowItem[]>(`/Sensors/${sensor.id}/maintenance-windows`), { notifications }),
    ]);

    if (!settingsResult.ok || !maintenanceResult.ok) {
      closeRuleModal();
      return;
    }

    setInitialMaintenanceWindows(maintenanceResult.data);
    setRuleForm({
      roomId: String(sensor.id),
      ...toRuleSettingsFormState(settingsResult.data),
      maintenanceWindows: maintenanceResult.data.map(toMaintenanceWindowFormState),
    });
  };

  const handleSaveRule = async () => {
    if (!ruleEditingSensor || !canSaveRule || ruleModalSaving) {
      return;
    }

    setRuleModalSaving(true);

    const roomId = Number(ruleForm.roomId);
    const settingsPayload = {
      minTemperature: ruleForm.minTemperature.trim() === "" ? null : Number(ruleForm.minTemperature),
      maxTemperature: ruleForm.maxTemperature.trim() === "" ? null : Number(ruleForm.maxTemperature),
      violationDelayMinutes: Number(ruleForm.violationDelayMinutes),
      repeatDelayMinutes: Number(ruleForm.repeatDelayMinutes),
      recoveryDelayMinutes: Number(ruleForm.recoveryDelayMinutes),
      isEnabled: ruleForm.isEnabled,
    };

    const settingsResult = await callApi(put(`/Sensors/${roomId}/settings`, settingsPayload), { notifications });
    if (!settingsResult.ok) {
      setRuleModalSaving(false);
      return;
    }

    const currentIds = new Set<number>();
    for (const window of ruleForm.maintenanceWindows) {
      const payload = {
        name: window.name.trim(),
        scheduleType: window.scheduleType,
        daysOfWeekMask: window.scheduleType === "weekly" ? window.daysOfWeekMask : null,
        startTime: toApiTimeValue(window.startTime),
        endTime: toApiTimeValue(window.endTime),
        startDate: window.scheduleType === "one_time" ? window.startDate : null,
        endDate: window.scheduleType === "one_time" ? window.endDate : null,
        isEnabled: window.isEnabled,
      };

      const result =
        window.id != null
          ? await callApi(put<MaintenanceWindowItem>(`/Sensors/maintenance-windows/${window.id}`, payload), { notifications })
          : await callApi(post<MaintenanceWindowItem>(`/Sensors/${roomId}/maintenance-windows`, payload), { notifications });

      if (!result.ok) {
        setRuleModalSaving(false);
        return;
      }

      currentIds.add(result.data.id);
    }

    for (const window of initialMaintenanceWindows) {
      if (currentIds.has(window.id)) {
        continue;
      }

      const deleteResult = await callApi(del(`/Sensors/maintenance-windows/${window.id}`), { notifications });
      if (!deleteResult.ok) {
        setRuleModalSaving(false);
        return;
      }
    }

    notifications.show("Правило сохранено", { severity: "success", autoHideDuration: 3000 });
    setRuleModalSaving(false);
    closeRuleModal();
    await Promise.all([loadSensors(), loadRuleRows()]);
  };

  const handleDeleteRule = async () => {
    if (!ruleEditingSensor || ruleModalSaving) {
      return;
    }

    setRuleModalSaving(true);
    const result = await callApi(del(`/Sensors/${ruleEditingSensor.id}/settings`), { notifications });
    if (!result.ok) {
      setRuleModalSaving(false);
      return;
    }

    notifications.show("Правило удалено", { severity: "success", autoHideDuration: 3000 });
    setRuleModalSaving(false);
    closeRuleModal();
    await Promise.all([loadSensors(), loadRuleRows()]);
  };

  return (
    <div className={styles.page}>
      <div className={styles.tabsWrap}>
        <TabNavigation items={tabs} activeIndex={activeTab} onChange={setActiveTab} />
      </div>

      {activeTab === 0 && (
        <SensorsCardsTab
          sensors={sensors}
          filteredSensors={filteredSensors}
          sensorsLoading={sensorsLoading}
          searchText={searchText}
          statusFilter={statusFilter}
          canManageDevices={isFullAccess}
          onSearchTextChange={setSearchText}
          onStatusFilterChange={setStatusFilter}
          onCreateSensor={openCreateModal}
          onEditSensor={openEditModal}
          onOpenRuleSettings={(sensor) => void openRuleModal(sensor)}
          onOpenChart={(sensor) => {
            setSelectedSensor(sensor);
            setHistoryPeriodHours(24);
          }}
        />
      )}

      {activeTab === 1 && <SensorRulesTab sensors={sensors} canEdit={canEditRules} />}

      {activeTab === 2 && isFullAccess && <SensorChatsTab sensors={sensors} />}

      <SensorEditModal
        mode={sensorModalMode}
        editingSensor={editingSensor}
        sensorForm={sensorForm}
        saving={savingSensor}
        canSave={canSaveSensor}
        onClose={closeSensorModal}
        onChange={setSensorForm}
        onSave={() => void handleSaveSensor()}
      />

      {selectedSensor && (
        <Suspense fallback={null}>
          <SensorHistoryModal
            sensor={selectedSensor}
            sensorSettings={selectedSensorSettings}
            maintenanceWindows={selectedSensorMaintenanceWindows}
            historyLoading={historyLoading}
            normalizedHistory={normalizedHistory}
            historyPeriodHours={historyPeriodHours}
            onPeriodChange={setHistoryPeriodHours}
            onClose={() => {
              setSelectedSensor(null);
              setSelectedSensorSettings(null);
              setSelectedSensorMaintenanceWindows([]);
              setHistoryPoints([]);
            }}
          />
        </Suspense>
      )}

      <SensorRuleModal
        isOpen={ruleModalOpen}
        title={ruleEditingSensor ? `Правило: ${ruleEditingSensor.name}` : "Настройка правила"}
        sensors={sensors}
        rowsRoomIds={ruleRows.map((row) => row.roomId)}
        editingRoomId={ruleEditingSensor?.id ?? null}
        ruleForm={ruleForm}
        saving={ruleModalSaving}
        canSave={canSaveRule}
        readOnly={!canEditRules}
        deleteConfirmOpen={ruleDeleteConfirmOpen}
        onClose={closeRuleModal}
        onSave={() => void handleSaveRule()}
        onDelete={canEditRules && ruleEditingSensor?.hasAlertSettings ? () => void handleDeleteRule() : null}
        onDeleteCancel={() => {
          if (!ruleModalSaving) {
            setRuleDeleteConfirmOpen(false);
          }
        }}
        onDeleteRequest={canEditRules && ruleEditingSensor?.hasAlertSettings ? () => setRuleDeleteConfirmOpen(true) : null}
        onRuleFormChange={setRuleForm}
      />
    </div>
  );
}
