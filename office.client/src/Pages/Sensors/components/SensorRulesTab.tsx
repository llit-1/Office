import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import { useNotifications } from "@toolpad/core";
import { useEffect, useMemo, useState } from "react";
import ConfirmModal from "../../../Components/ConfirmModal/ConfirmModal";
import GenericTable, { type Column } from "../../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../../Components/GenericTable/searchUtils";
import Input from "../../../Components/Input/Input";
import Modal from "../../../Components/Modal/Modal";
import Select from "../../../Components/Select/Select";
import Toggle from "../../../Components/Toggle/Toggle";
import useDebouncedValue from "../../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../../Hooks/usePersistedSearchText";
import { callApi, del, get, post, put } from "../../../Services/api";
import type {
  MaintenanceWindowFormState,
  MaintenanceWindowItem,
  SensorRow,
  SensorRuleRow,
  SensorRuleSettings,
} from "../sensors.types";
import {
  defaultMaintenanceWindowFormState,
  defaultRuleSettingsFormState,
  formatDelaySummary,
  formatMaintenanceSchedule,
  formatTemperatureRange,
  scheduleTypeOptions,
  toApiTimeValue,
  toMaintenanceWindowFormState,
  toRuleSettingsFormState,
  weekDays,
} from "../sensors.utils";
import styles from "../Sensors.module.css";

type RuleModalState = {
  roomId: string;
  minTemperature: string;
  maxTemperature: string;
  violationDelayMinutes: string;
  repeatDelayMinutes: string;
  recoveryDelayMinutes: string;
  isEnabled: boolean;
  maintenanceWindows: MaintenanceWindowFormState[];
};

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

  const availableSensorOptions = useMemo(() => {
    const occupiedIds = new Set(rows.map((row) => row.roomId));

    return sensors
      .filter((sensor) => !occupiedIds.has(sensor.id) || sensor.id === Number(ruleForm.roomId))
      .map((sensor) => ({
        value: String(sensor.id),
        label: `${sensor.name} (${sensor.ip})`,
      }));
  }, [rows, ruleForm.roomId, sensors]);

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

  const updateMaintenanceWindow = (index: number, patch: Partial<MaintenanceWindowFormState>) => {
    setRuleForm((current) => ({
      ...current,
      maintenanceWindows: current.maintenanceWindows.map((window, windowIndex) =>
        windowIndex === index ? { ...window, ...patch } : window,
      ),
    }));
  };

  const removeMaintenanceWindow = (index: number) => {
    setRuleForm((current) => ({
      ...current,
      maintenanceWindows: current.maintenanceWindows.filter((_, windowIndex) => windowIndex !== index),
    }));
  };

  const toggleWeekDay = (index: number, value: number) => {
    const currentMask = ruleForm.maintenanceWindows[index]?.daysOfWeekMask ?? 0;
    updateMaintenanceWindow(index, {
      daysOfWeekMask: currentMask & value ? currentMask & ~value : currentMask | value,
    });
  };

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
        <button type="button" className={styles.addSensorButton} onClick={openCreateModal} disabled={!canAddRule}>
          Добавить правило
        </button>
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

      <Modal
        isOpen={modalOpen}
        onClose={() => {
          if (saving) {
            return;
          }

          resetModalState();
        }}
        title={editingRow ? `Правило: ${editingRow.sensorName}` : "Новое правило"}
        size="lg"
      >
        <div className={styles.rulesModalLayout}>
          <section className={styles.rulesSectionCard}>
            <div className={styles.rulesModalGrid}>
              <Select
                label="Датчик"
                options={availableSensorOptions}
                value={ruleForm.roomId}
                onChange={(event) => setRuleForm((current) => ({ ...current, roomId: event.target.value }))}
                disabled={editingRow !== null}
                search
              />

              <Input
                label="Минимальная температура"
                type="number"
                step="0.1"
                value={ruleForm.minTemperature}
                onChange={(event) => setRuleForm((current) => ({ ...current, minTemperature: event.target.value }))}
              />

              <Input
                label="Максимальная температура"
                type="number"
                step="0.1"
                value={ruleForm.maxTemperature}
                onChange={(event) => setRuleForm((current) => ({ ...current, maxTemperature: event.target.value }))}
              />

              <Input
                label="Первое уведомление, мин"
                type="number"
                min={1}
                value={ruleForm.violationDelayMinutes}
                onChange={(event) => setRuleForm((current) => ({ ...current, violationDelayMinutes: event.target.value }))}
              />

              <Input
                label="Повтор, мин"
                type="number"
                min={1}
                value={ruleForm.repeatDelayMinutes}
                onChange={(event) => setRuleForm((current) => ({ ...current, repeatDelayMinutes: event.target.value }))}
              />

              <Input
                label="Нормализация, мин"
                type="number"
                min={1}
                value={ruleForm.recoveryDelayMinutes}
                onChange={(event) => setRuleForm((current) => ({ ...current, recoveryDelayMinutes: event.target.value }))}
              />

              <button
                type="button"
                className={`${styles.rulesToggleCard} ${styles.rulesToggleCardWide}`}
                onClick={() => setRuleForm((current) => ({ ...current, isEnabled: !current.isEnabled }))}
                aria-pressed={ruleForm.isEnabled}
              >
                <strong className={styles.rulesToggleTitle}>Правило активно</strong>
                <Toggle
                  checked={ruleForm.isEnabled}
                  onChange={(checked) => setRuleForm((current) => ({ ...current, isEnabled: checked }))}
                  ariaLabel="Правило активно"
                  small
                  containerClassName={styles.rulesToggleControl}
                />
              </button>
            </div>
          </section>

          <section className={styles.rulesSectionCard}>
            <div className={styles.ruleCardHeader}>
              <div>
                <h3>График технических работ</h3>
              </div>

              <button
                type="button"
                className={styles.addRuleButtonSecondary}
                onClick={() =>
                  setRuleForm((current) => ({
                    ...current,
                    maintenanceWindows: [...current.maintenanceWindows, { ...defaultMaintenanceWindowFormState }],
                  }))
                }
              >
                <AddRoundedIcon fontSize="small" />
                <span>Добавить окно</span>
              </button>
            </div>

            {ruleForm.maintenanceWindows.length === 0 ? (
              <div className={styles.ruleCardEmpty}>Окна техработ пока не добавлены.</div>
            ) : (
              <div className={styles.ruleModalMaintenanceList}>
                {ruleForm.maintenanceWindows.map((window, index) => (
                  <div key={`${window.id ?? "new"}-${index}`} className={styles.ruleModalMaintenanceCard}>
                    <div className={styles.ruleModalMaintenanceHeader}>
                      <strong>{window.name.trim() || `Окно ${index + 1}`}</strong>
                      <button
                        type="button"
                        className={`${styles.tableIconButton} ${styles.maintenanceDeleteButton}`}
                        onClick={() => removeMaintenanceWindow(index)}
                        title="Удалить окно"
                      >
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </button>
                    </div>

                    <div className={styles.rulesModalGrid}>
                      <Input
                        label="Название окна"
                        value={window.name}
                        onChange={(event) => updateMaintenanceWindow(index, { name: event.target.value })}
                        maxLength={120}
                      />

                      <Select
                        label="Тип расписания"
                        options={scheduleTypeOptions.map((option) => ({ value: option.value, label: option.label }))}
                        value={window.scheduleType}
                        onChange={(event) =>
                          updateMaintenanceWindow(index, {
                            scheduleType: event.target.value as MaintenanceWindowFormState["scheduleType"],
                            daysOfWeekMask: event.target.value === "weekly" ? window.daysOfWeekMask : 0,
                            startDate: event.target.value === "one_time" ? window.startDate : "",
                            endDate: event.target.value === "one_time" ? window.endDate : "",
                          })
                        }
                      />

                      <Input
                        label="Начало"
                        type="time"
                        value={window.startTime}
                        onChange={(event) => updateMaintenanceWindow(index, { startTime: event.target.value })}
                      />

                      <Input
                        label="Окончание"
                        type="time"
                        value={window.endTime}
                        onChange={(event) => updateMaintenanceWindow(index, { endTime: event.target.value })}
                      />
                    </div>

                    {window.scheduleType === "weekly" && (
                      <div className={styles.daysPicker}>
                        <span className={styles.daysPickerLabel}>Дни недели</span>
                        <div className={styles.daysPickerGrid}>
                          {weekDays.map((day) => {
                            const selected = Boolean(window.daysOfWeekMask & day.value);
                            return (
                              <button
                                key={day.value}
                                type="button"
                                className={`${styles.dayChip} ${selected ? styles.dayChipActive : ""}`}
                                onClick={() => toggleWeekDay(index, day.value)}
                              >
                                {day.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {window.scheduleType === "one_time" && (
                      <div className={styles.inlineRuleFields}>
                        <Input
                          label="Дата начала"
                          type="date"
                          value={window.startDate}
                          onChange={(event) => updateMaintenanceWindow(index, { startDate: event.target.value })}
                        />

                        <Input
                          label="Дата окончания"
                          type="date"
                          value={window.endDate}
                          onChange={(event) => updateMaintenanceWindow(index, { endDate: event.target.value })}
                        />
                      </div>
                    )}

                    <div className={styles.maintenancePreviewBadge}>{formatMaintenanceSchedule(window)}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className={styles.editActions}>
          {editingRow && (
            <button
              type="button"
              className={styles.editDeleteButton}
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={saving}
            >
              Удалить
            </button>
          )}

          <button
            type="button"
            className={styles.editCancelButton}
            onClick={resetModalState}
            disabled={saving}
          >
            Отмена
          </button>

          <button type="button" className={styles.editSaveButton} onClick={() => void handleSave()} disabled={!canSave || saving}>
            {saving ? "Сохраняем..." : editingRow ? "Сохранить" : "Создать"}
          </button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="Удалить правило?"
        message={editingRow ? `Правило для датчика "${editingRow.sensorName}" будет удалено вместе с окнами техработ.` : ""}
        onCancel={() => {
          if (saving) {
            return;
          }

          setDeleteConfirmOpen(false);
        }}
        onConfirm={() => void handleDeleteRule()}
        confirmLabel={saving ? "Удаление..." : "Удалить"}
        cancelLabel="Отмена"
      />
    </section>
  );
}
