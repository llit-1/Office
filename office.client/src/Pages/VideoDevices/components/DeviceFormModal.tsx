import type { Dispatch, SetStateAction } from "react";
import MusicNoteRoundedIcon from "@mui/icons-material/MusicNoteRounded";
import OndemandVideoRoundedIcon from "@mui/icons-material/OndemandVideoRounded";
import Input from "../../../Components/Input/Input";
import LoadingSpinner from "../../../Components/LoadingSpinner/LoadingSpinner";
import Modal from "../../../Components/Modal/Modal";
import Select from "../../../Components/Select/Select";
import type { DeviceFormState, FormDataResponse } from "../videoDevices.types";
import styles from "../VideoDevices.module.css";

type DeviceFormModalProps = {
  isOpen: boolean;
  editingDeviceGuid: string | null;
  formData: FormDataResponse | null;
  formState: DeviceFormState;
  saving: boolean;
  onFormStateChange: Dispatch<SetStateAction<DeviceFormState>>;
  onDelete: (deviceGuid: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export default function DeviceFormModal({
  isOpen,
  editingDeviceGuid,
  formData,
  formState,
  saving,
  onFormStateChange,
  onDelete,
  onClose,
  onSave,
}: DeviceFormModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={editingDeviceGuid ? "Редактировать устройство" : "Добавить устройство"}
      size="lg"
      panelClassName={styles.modalPanel}
      bodyClassName={styles.modalBody}
    >
      {!formData ? (
        <div className={styles.loader}>
          <LoadingSpinner />
        </div>
      ) : (
        <div className={styles.form}>
          <Select
            label="ТТ"
            search
            value={formState.locationGuid}
            options={formData.locations.map((location) => ({ value: location.guid, label: location.name }))}
            placeholder="Выберите ТТ"
            onChange={(event) => onFormStateChange((current) => ({ ...current, locationGuid: event.target.value }))}
          />
          <Input
            label="IP"
            value={formState.ip}
            onChange={(event) => onFormStateChange((current) => ({ ...current, ip: event.target.value }))}
            placeholder="192.168.0.10:8080"
          />

          <div className={styles.formRow}>
            <Input
              label="Время выключения звука"
              type="time"
              value={formState.muteStartTime}
              onChange={(event) => onFormStateChange((current) => ({ ...current, muteStartTime: event.target.value }))}
            />
            <Input
              label="Время включения звука"
              type="time"
              value={formState.muteEndTime}
              onChange={(event) => onFormStateChange((current) => ({ ...current, muteEndTime: event.target.value }))}
            />
          </div>

          <Select
            label="Папка рекламы"
            value={formState.customAds}
            options={[
              { value: "", label: "По умолчанию" },
              ...formData.customAdsDirectories.map((name) => ({ value: name, label: name })),
            ]}
            onChange={(event) => onFormStateChange((current) => ({ ...current, customAds: event.target.value }))}
          />

          <div className={styles.segmented}>
            <button
              type="button"
              className={formState.contentType === "video" ? styles.segmentedActive : ""}
              onClick={() => onFormStateChange((current) => ({ ...current, contentType: "video" }))}
            >
              <OndemandVideoRoundedIcon fontSize="small" />
              Только видео
            </button>
            <button
              type="button"
              className={formState.contentType === "music" ? styles.segmentedActive : ""}
              onClick={() => onFormStateChange((current) => ({ ...current, contentType: "music" }))}
            >
              <MusicNoteRoundedIcon fontSize="small" />
              Только музыка
            </button>
          </div>

          <Select
            label="Видео"
            search
            value={formState.videoNames[0] ?? ""}
            options={[
              { value: "", label: "Видео не выбрано" },
              ...formData.videos.map((video) => ({ value: video.name, label: video.name })),
            ]}
            placeholder="Выберите видео"
            onChange={(event) =>
              onFormStateChange((current) => ({
                ...current,
                videoNames: event.target.value ? [event.target.value] : [],
              }))
            }
          />

          <div className={styles.modalActions}>
            {editingDeviceGuid && (
              <button type="button" className={styles.dangerButton} onClick={() => onDelete(editingDeviceGuid)}>
                Удалить
              </button>
            )}
            <button type="button" className={styles.secondaryButton} onClick={onClose}>
              Отмена
            </button>
            <button type="button" className={styles.primaryButton} onClick={onSave} disabled={saving}>
              Сохранить
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
