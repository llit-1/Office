import { useMemo } from "react";
import ConfirmModal from "../../../Components/ConfirmModal/ConfirmModal";
import Button from "../../../Components/Button/Button";
import Input from "../../../Components/Input/Input";
import { MultiplySelect } from "../../../Components/MultiplySelect/MultiplySelect";
import Modal from "../../../Components/Modal/Modal";
import type { AdDirectoryUser } from "../../../Interfaces/Users";
import type { SensorChatFormState, SensorChatRow, SensorRow } from "../sensors.types";
import { getAdUserLabel } from "../sensors.utils";
import styles from "../Sensors.module.css";

interface SensorChatModalProps {
  isOpen: boolean;
  mode: "create" | "edit";
  form: SensorChatFormState;
  sensors: SensorRow[];
  users: AdDirectoryUser[];
  usersLoading: boolean;
  editingChat: SensorChatRow | null;
  saving: boolean;
  deleteConfirmOpen: boolean;
  canSave: boolean;
  onClose: () => void;
  onChange: (next: SensorChatFormState) => void;
  onSave: () => void;
  onDeleteClick: () => void;
  onDeleteCancel: () => void;
  onDeleteConfirm: () => void;
}

export default function SensorChatModal({
  isOpen,
  mode,
  form,
  sensors,
  users,
  usersLoading,
  editingChat,
  saving,
  deleteConfirmOpen,
  canSave,
  onClose,
  onChange,
  onSave,
  onDeleteClick,
  onDeleteCancel,
  onDeleteConfirm,
}: SensorChatModalProps) {
  const sortedSensors = useMemo(
    () => [...sensors].sort((left, right) => left.name.localeCompare(right.name, "ru")),
    [sensors],
  );
  const sortedUsers = useMemo(
    () => [...users].sort((left, right) => getAdUserLabel(left).localeCompare(getAdUserLabel(right), "ru")),
    [users],
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={mode === "create" ? "Новый чат" : `Чат: ${editingChat?.name ?? ""}`}
        size="lg"
        bodyClassName={styles.chatModalBody}
      >
        <div className={styles.chatModalLayout}>
          <section className={styles.rulesSectionCard}>
            <div className={styles.chatNameField}>
              <Input
                label="Название группы"
                value={form.name}
                onChange={(event) => onChange({ ...form, name: event.target.value })}
                maxLength={120}
              />
            </div>
          </section>

          <div className={styles.chatSelectsGrid}>
            <section className={styles.rulesSectionCard}>
              <div className={styles.chatSelectHeader}>
                <h3>Датчики</h3>
                <span>{form.roomIds.length} выбрано</span>
              </div>
              <div className={styles.chatSelectPanel}>
                <MultiplySelect
                  items={sortedSensors}
                  getKey={(sensor) => sensor.id}
                  getLabel={(sensor) => `${sensor.name} [${sensor.ip}]`}
                  selectedKeys={form.roomIds}
                  onChange={(nextSelectedKeys) =>
                    onChange({
                      ...form,
                      roomIds: nextSelectedKeys.map((value) => Number(value)),
                    })
                  }
                  placeholder="Поиск по датчикам..."
                />
              </div>
            </section>

            <section className={styles.rulesSectionCard}>
              <div className={styles.chatSelectHeader}>
                <h3>Участники</h3>
                <span>{form.userLogins.length} выбрано</span>
              </div>
              <div className={styles.chatSelectPanel}>
                <MultiplySelect
                  items={sortedUsers}
                  getKey={(user) => user.login}
                  getLabel={getAdUserLabel}
                  selectedKeys={form.userLogins}
                  onChange={(nextSelectedKeys) =>
                    onChange({
                      ...form,
                      userLogins: nextSelectedKeys.map((value) => String(value)),
                    })
                  }
                  placeholder={usersLoading ? "Загружаем пользователей AD..." : "Поиск по людям..."}
                  loading={usersLoading}
                  loadingText="Загружаем пользователей AD..."
                />
              </div>
            </section>
          </div>
        </div>

        <div className={`${styles.editActions} ${styles.chatEditActions}`}>
          {mode === "edit" && (
            <Button
              variant="danger"
              className={styles.editDeleteAction}
              onClick={onDeleteClick}
              disabled={saving}
            >
              Удалить
            </Button>
          )}

          <Button
            variant="secondary"
            onClick={onClose}
            disabled={saving}
          >
            Отмена
          </Button>

          <Button
            variant="primary"
            onClick={onSave}
            disabled={!canSave}
            loading={saving}
          >
            {saving ? "Сохраняем..." : mode === "create" ? "Создать" : "Сохранить"}
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="Удалить чат?"
        message={editingChat ? `Чат "${editingChat.name}" будет удалён.` : ""}
        onCancel={onDeleteCancel}
        onConfirm={onDeleteConfirm}
        confirmLabel={saving ? "Удаление..." : "Удалить"}
        cancelLabel="Отмена"
      />
    </>
  );
}
