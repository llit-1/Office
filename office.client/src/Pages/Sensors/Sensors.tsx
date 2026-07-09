import { useEffect, useMemo, useState } from "react";
import { useNotifications } from "@toolpad/core";
import { useDispatch } from "react-redux";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import { callApi, get, post, put } from "../../Services/api";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import SensorChatsTab from "./components/SensorChatsTab";
import SensorEditModal from "./components/SensorEditModal";
import SensorHistoryModal from "./components/SensorHistoryModal";
import SensorRulesTab from "./components/SensorRulesTab";
import SensorsCardsTab from "./components/SensorsCardsTab";
import type {
  MaintenanceWindowItem,
  SensorFormState,
  SensorHistoryPoint,
  SensorRow,
  SensorRuleSettings,
} from "./sensors.types";
import { defaultSensorFormState, normalizeHistory, periodOptions } from "./sensors.utils";
import styles from "./Sensors.module.css";

const tabs = ["Датчики", "Правила", "Чаты"];

export default function Sensors() {
  const dispatch = useDispatch();
  const notifications = useNotifications();

  const [activeTab, setActiveTab] = useState(0);
  const [sensors, setSensors] = useState<SensorRow[]>([]);
  const [sensorsLoading, setSensorsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
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

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const ok = await loadSensors();
      if (!ok && !cancelled) {
        setSensorsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [notifications]);

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
        callApi(get<MaintenanceWindowItem[]>(`/Sensors/${selectedSensor.id}/maintenance-windows`), { notifications }),
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
        const matchesStatus =
          statusFilter === "all"
            ? true
            : statusFilter === "online"
              ? sensor.actual !== 0
              : sensor.actual === 0;

        if (!matchesStatus) {
          return false;
        }

        if (!normalizedSearch) {
          return true;
        }

        return sensor.name.toLowerCase().includes(normalizedSearch) || sensor.ip.toLowerCase().includes(normalizedSearch);
      })
      .sort((left, right) => {
        const leftInactive = left.actual === 0 ? 1 : 0;
        const rightInactive = right.actual === 0 ? 1 : 0;

        if (leftInactive !== rightInactive) {
          return leftInactive - rightInactive;
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
    await loadSensors();
  };

  const canSaveSensor = sensorForm.name.trim().length > 0 && sensorForm.ip.trim().length > 0;

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
          onSearchTextChange={setSearchText}
          onStatusFilterChange={setStatusFilter}
          onCreateSensor={openCreateModal}
          onEditSensor={openEditModal}
          onOpenChart={(sensor) => {
            setSelectedSensor(sensor);
            setHistoryPeriodHours(24);
          }}
        />
      )}

      {activeTab === 1 && <SensorRulesTab sensors={sensors} />}

      {activeTab === 2 && <SensorChatsTab sensors={sensors} />}

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
    </div>
  );
}
