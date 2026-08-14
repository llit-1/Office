import AddRoundedIcon from "@mui/icons-material/AddRounded";
import { useNotifications } from "@toolpad/core";
import { useEffect, useMemo, useState } from "react";
import GenericTable, { type Column } from "../../../Components/GenericTable/GenericTable";
import Button from "../../../Components/Button/Button";
import { includesNormalized } from "../../../Components/GenericTable/searchUtils";
import useDebouncedValue from "../../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../../Hooks/usePersistedSearchText";
import { callApi, del, get, post, put } from "../../../Services/api";
import type {
  MaintenanceWindowItem,
  SensorRow,
  SensorRuleRow,
  SensorRuleSettings,
} from "../sensors.types";
import {
  defaultRuleSettingsFormState,
  formatDelaySummary,
  formatTemperatureRange,
  toApiTimeValue,
  toMaintenanceWindowFormState,
  toRuleSettingsFormState,
} from "../sensors.utils";
import SensorRuleModal, { type RuleModalState } from "./SensorRuleModal";
import styles from "../Sensors.module.css";

const tableStateKey = "sensor-rules-list";

const emptyRuleModalState = (roomId = ""): RuleModalState => ({
  roomId,
  ...defaultRuleSettingsFormState,
  maintenanceWindows: [],
});

interface SensorRulesTabProps {
  sensors: SensorRow[];
}

export default function SensorRulesTab({ sensors }: SensorRulesTabProps) {
  const notifications = useNotifications();
  const [searchText, setSearchText] = usePersistedSearchText(tableStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SensorRuleRow[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<SensorRuleRow | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleModalState>(emptyRuleModalState());
  const [initialMaintenanceWindows, setInitialMaintenanceWindows] = useState<MaintenanceWindowItem[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const loadRows = async () => {
    setLoading(true);
    const result = await callApi(get<SensorRuleRow[]>("/Sensors/rules"), { notifications });
    setLoading(false);

    if (!result.ok) {
      return;
    }

    setRows(result.data);
  };

  useEffect(() => {
    void loadRows();
  }, []);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        includesNormalized(
          `${row.sensorName} ${row.ip} ${formatTemperatureRange(row.minTemperature, row.maxTemperature)} ${row.maintenanceSummary ?? ""}`,
          debouncedSearchText,
        ),
      ),
    [debouncedSearchText, rows],
  );

  const openCreateModal = () => {
    const firstAvailableSensor = sensors.find((sensor) => !rows.some((row) => row.roomId === sensor.id));
    setEditingRow(null);
    setDeleteConfirmOpen(false);
    setInitialMaintenanceWindows([]);
    setRuleForm(emptyRuleModalState(firstAvailableSensor ? String(firstAvailableSensor.id) : ""));
    setModalOpen(true);
  };

  const openEditModal = async (row: SensorRuleRow) => {
    setEditingRow(row);
    setDeleteConfirmOpen(false);
    setModalOpen(true);

    const settingsResult = await callApi(get<SensorRuleSettings>(`/Sensors/${row.roomId}/settings`), { notifications });
    if (!settingsResult.ok) {
      setModalOpen(false);
      return;
    }

    const maintenanceResult = await callApi(get<MaintenanceWindowItem[]>(`/Sensors/${row.roomId}/maintenance-windows`), { notifications });
    if (!maintenanceResult.ok) {
      setModalOpen(false);
      return;
    }

    setInitialMaintenanceWindows(maintenanceResult.data);
    setRuleForm({
      roomId: String(row.roomId),
      ...toRuleSettingsFormState(settingsResult.data),
      maintenanceWindows: maintenanceResult.data.map(toMaintenanceWindowFormState),
    });
  };

  const canAddRule = sensors.some((sensor) => !rows.some((row) => row.roomId === sensor.id));

  const canSave = useMemo(() => {
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

      return true;
    });
  }, [ruleForm]);

  const resetModalState = () => {
    setModalOpen(false);
    setEditingRow(null);
    setDeleteConfirmOpen(false);
    setInitialMaintenanceWindows([]);
    setRuleForm(emptyRuleModalState());
  };

  const handleSave = async () => {
    if (!canSave || saving) {
      return;
    }

    setSaving(true);

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
      setSaving(false);
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
        setSaving(false);
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
        setSaving(false);
        return;
      }
    }

    notifications.show(editingRow ? "Правило сохранено" : "Правило добавлено", {
      severity: "success",
      autoHideDuration: 3000,
    });

    setSaving(false);
    resetModalState();
    await loadRows();
  };

  const handleDeleteRule = async () => {
    if (!editingRow || saving) {
      return;
    }

    setSaving(true);

    const result = await callApi(del(`/Sensors/${editingRow.roomId}/settings`), { notifications });
    if (!result.ok) {
      setSaving(false);
      return;
    }

    notifications.show("Правило удалено", {
      severity: "success",
      autoHideDuration: 3000,
    });

    setSaving(false);
    resetModalState();
    await loadRows();
  };

  const columns: Column<SensorRuleRow>[] = [
    { key: "sensorName", label: "Датчик" },
    { key: "ip", label: "IP" },
    {
      label: "Температура",
      render: (row) => formatTemperatureRange(row.minTemperature, row.maxTemperature),
      sortValue: (row) => `${row.minTemperature ?? ""}-${row.maxTemperature ?? ""}`,
    },
    {
      label: "Уведомления",
      render: (row) => formatDelaySummary(row.violationDelayMinutes, row.repeatDelayMinutes, row.recoveryDelayMinutes),
    },
    {
      label: "Техработы",
      render: (row) => (
        <div className={styles.rulesTableCell}>
          <strong>{row.maintenanceWindowsCount > 0 ? `${row.maintenanceWindowsCount} шт.` : "Нет"}</strong>
          <span>{row.maintenanceSummary ?? "Окна не заданы"}</span>
        </div>
      ),
      sortValue: (row) => row.maintenanceWindowsCount,
    },
    {
      label: "Статус",
      render: (row) => (
        <span className={`${styles.ruleStateBadge} ${row.isEnabled ? styles.ruleStateEnabled : styles.ruleStateDisabled}`}>
          {row.isEnabled ? "Активно" : "Выключено"}
        </span>
      ),
      sortValue: (row) => (row.isEnabled ? 1 : 0),
      filterValue: (row) => (row.isEnabled ? "Активно" : "Выключено"),
    },
  ];

  return (
    <section className={`${styles.contentSection} ${styles.rulesTabSection}`}>
      <div className={styles.rulesTableToolbar}>
        <Button variant="primary" onClick={openCreateModal} disabled={!canAddRule}>
          <AddRoundedIcon fontSize="small" />
          Добавить правило
        </Button>
      </div>

      <GenericTable<SensorRuleRow>
        data={filteredRows}
        columns={columns}
        loading={loading}
        addOption={canAddRule}
        onAddClick={openCreateModal}
        onRowClick={(row) => void openEditModal(row)}
        wrapperClassName={styles.rulesTableWrapper}
        tableStateKey={tableStateKey}
        searchPlaceholder="Поиск по датчику, IP или настройкам"
        searchText={searchText}
        onSearchTextChange={setSearchText}
        highlightQuery={debouncedSearchText}
      />

      <SensorRuleModal
        isOpen={modalOpen}
        title={editingRow ? `Правило: ${editingRow.sensorName}` : "Новое правило"}
        sensors={sensors}
        rowsRoomIds={rows.map((row) => row.roomId)}
        editingRoomId={editingRow?.roomId ?? null}
        ruleForm={ruleForm}
        saving={saving}
        canSave={canSave}
        deleteConfirmOpen={deleteConfirmOpen}
        onClose={() => {
          if (!saving) {
            resetModalState();
          }
        }}
        onSave={() => void handleSave()}
        onDelete={editingRow ? () => void handleDeleteRule() : null}
        onDeleteCancel={() => {
          if (!saving) {
            setDeleteConfirmOpen(false);
          }
        }}
        onDeleteRequest={editingRow ? () => setDeleteConfirmOpen(true) : null}
        onRuleFormChange={setRuleForm}
      />
    </section>
  );
}
