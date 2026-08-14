import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ConfirmModal from "../../../Components/ConfirmModal/ConfirmModal";
import Button from "../../../Components/Button/Button";
import Input from "../../../Components/Input/Input";
import Modal from "../../../Components/Modal/Modal";
import Select from "../../../Components/Select/Select";
import Toggle from "../../../Components/Toggle/Toggle";
import type { MaintenanceWindowFormState, SensorRow } from "../sensors.types";
import {
  defaultMaintenanceWindowFormState,
  formatMaintenanceSchedule,
  scheduleTypeOptions,
  weekDays,
} from "../sensors.utils";
import styles from "../Sensors.module.css";

export type RuleModalState = {
  roomId: string;
  minTemperature: string;
  maxTemperature: string;
  violationDelayMinutes: string;
  repeatDelayMinutes: string;
  recoveryDelayMinutes: string;
  isEnabled: boolean;
  maintenanceWindows: MaintenanceWindowFormState[];
};

interface SensorRuleModalProps {
  isOpen: boolean;
  title: string;
  sensors: SensorRow[];
  rowsRoomIds: number[];
  editingRoomId: number | null;
  ruleForm: RuleModalState;
  saving: boolean;
  canSave: boolean;
  deleteConfirmOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  onDelete: (() => void) | null;
  onDeleteCancel: () => void;
  onDeleteRequest: (() => void) | null;
  onRuleFormChange: (next: RuleModalState) => void;
}

export default function SensorRuleModal({
  isOpen,
  title,
  sensors,
  rowsRoomIds,
  editingRoomId,
  ruleForm,
  saving,
  canSave,
  deleteConfirmOpen,
  onClose,
  onSave,
  onDelete,
  onDeleteCancel,
  onDeleteRequest,
  onRuleFormChange,
}: SensorRuleModalProps) {
  const availableSensorOptions = sensors
    .filter((sensor) => !rowsRoomIds.includes(sensor.id) || sensor.id === Number(ruleForm.roomId))
    .map((sensor) => ({
      value: String(sensor.id),
      label: `${sensor.name} (${sensor.ip})`,
    }));

  const updateRuleForm = (patch: Partial<RuleModalState>) => {
    onRuleFormChange({ ...ruleForm, ...patch });
  };

  const updateMaintenanceWindow = (index: number, patch: Partial<MaintenanceWindowFormState>) => {
    onRuleFormChange({
      ...ruleForm,
      maintenanceWindows: ruleForm.maintenanceWindows.map((window, windowIndex) =>
        windowIndex === index ? { ...window, ...patch } : window,
      ),
    });
  };

  const removeMaintenanceWindow = (index: number) => {
    onRuleFormChange({
      ...ruleForm,
      maintenanceWindows: ruleForm.maintenanceWindows.filter((_, windowIndex) => windowIndex !== index),
    });
  };

  const toggleWeekDay = (index: number, value: number) => {
    const currentMask = ruleForm.maintenanceWindows[index]?.daysOfWeekMask ?? 0;
    updateMaintenanceWindow(index, {
      daysOfWeekMask: currentMask & value ? currentMask & ~value : currentMask | value,
    });
  };

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={title} size="lg">
        <div className={styles.rulesModalLayout}>
          <section className={styles.rulesSectionCard}>
            <div className={styles.rulesModalGrid}>
              <Select
                label="Датчик"
                options={availableSensorOptions}
                value={ruleForm.roomId}
                onChange={(event) => updateRuleForm({ roomId: event.target.value })}
                disabled={editingRoomId !== null}
                search
              />

              <Input
                label="Минимальная температура"
                type="number"
                step="0.1"
                value={ruleForm.minTemperature}
                onChange={(event) => updateRuleForm({ minTemperature: event.target.value })}
              />

              <Input
                label="Максимальная температура"
                type="number"
                step="0.1"
                value={ruleForm.maxTemperature}
                onChange={(event) => updateRuleForm({ maxTemperature: event.target.value })}
              />

              <Input
                label="Первое уведомление, мин"
                type="number"
                min={1}
                value={ruleForm.violationDelayMinutes}
                onChange={(event) => updateRuleForm({ violationDelayMinutes: event.target.value })}
              />

              <Input
                label="Повтор, мин"
                type="number"
                min={1}
                value={ruleForm.repeatDelayMinutes}
                onChange={(event) => updateRuleForm({ repeatDelayMinutes: event.target.value })}
              />

              <Input
                label="Нормализация, мин"
                type="number"
                min={1}
                value={ruleForm.recoveryDelayMinutes}
                onChange={(event) => updateRuleForm({ recoveryDelayMinutes: event.target.value })}
              />

              <Toggle
                label="Правило активно"
                checked={ruleForm.isEnabled}
                onChange={(checked) => updateRuleForm({ isEnabled: checked })}
                ariaLabel="Правило активно"
                small
                containerClassName={`${styles.rulesToggleCard} ${styles.rulesToggleCardWide}`}
                labelClassName={styles.rulesToggleTitle}
              />
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
                  onRuleFormChange({
                    ...ruleForm,
                    maintenanceWindows: [...ruleForm.maintenanceWindows, { ...defaultMaintenanceWindowFormState }],
                  })
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
          {onDeleteRequest && (
            <Button variant="danger" className={styles.editDeleteAction} onClick={onDeleteRequest} disabled={saving}>
              Удалить
            </Button>
          )}

          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Отмена
          </Button>

          <Button variant="primary" onClick={onSave} disabled={!canSave} loading={saving}>
            {saving ? "Сохраняем..." : editingRoomId !== null ? "Сохранить" : "Создать"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="Удалить правило?"
        message={title ? `${title} будет удалено вместе с окнами техработ.` : ""}
        onCancel={onDeleteCancel}
        onConfirm={() => onDelete?.()}
        confirmLabel={saving ? "Удаление..." : "Удалить"}
        cancelLabel="Отмена"
      />
    </>
  );
}
