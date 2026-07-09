import Input from "../../../Components/Input/Input";
import Modal from "../../../Components/Modal/Modal";
import Toggle from "../../../Components/Toggle/Toggle";
import type { SensorFormState, SensorRow } from "../sensors.types";
import styles from "../Sensors.module.css";

interface SensorEditModalProps {
  mode: "create" | "edit" | null;
  editingSensor: SensorRow | null;
  sensorForm: SensorFormState;
  saving: boolean;
  canSave: boolean;
  onClose: () => void;
  onChange: (next: SensorFormState) => void;
  onSave: () => void;
}

export default function SensorEditModal({
  mode,
  editingSensor,
  sensorForm,
  saving,
  canSave,
  onClose,
  onChange,
  onSave,
}: SensorEditModalProps) {
  return (
    <Modal
      isOpen={mode !== null}
      onClose={onClose}
      title={
        mode === "create"
          ? "Новый датчик"
          : editingSensor
            ? `Датчик: ${editingSensor.name}`
            : "Редактирование датчика"
      }
      size="md"
    >
      <div className={styles.editForm}>
        <Input
          label="Название датчика"
          value={sensorForm.name}
          onChange={(event) => onChange({ ...sensorForm, name: event.target.value })}
          maxLength={60}
        />
        <Input
          label="IP"
          value={sensorForm.ip}
          onChange={(event) => onChange({ ...sensorForm, ip: event.target.value })}
          maxLength={20}
        />

        <div className={styles.activityField}>
          <button
            type="button"
            className={styles.activityFieldButton}
            onClick={() => onChange({ ...sensorForm, isActive: !sensorForm.isActive })}
            aria-pressed={sensorForm.isActive}
            aria-label={`Активность датчика: ${sensorForm.isActive ? "активен" : "неактивен"}`}
          >
            <span className={styles.activityLabel}>Активность</span>

            <div className={styles.activityToggleRow} onClick={(event) => event.stopPropagation()}>
              <Toggle
                checked={sensorForm.isActive}
                onChange={(checked) => onChange({ ...sensorForm, isActive: checked })}
                ariaLabel="Активность датчика"
                small
                containerClassName={styles.activityToggle}
              />
            </div>
          </button>
        </div>
      </div>

      <div className={styles.editActions}>
        <button type="button" className={styles.editCancelButton} onClick={onClose} disabled={saving}>
          Отмена
        </button>
        <button type="button" className={styles.editSaveButton} onClick={onSave} disabled={!canSave || saving}>
          {saving ? "Сохраняем..." : mode === "create" ? "Создать" : "Сохранить"}
        </button>
      </div>
    </Modal>
  );
}
