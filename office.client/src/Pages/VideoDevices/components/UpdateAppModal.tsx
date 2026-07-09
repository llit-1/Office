import Modal from "../../../Components/Modal/Modal";
import Select from "../../../Components/Select/Select";
import type { ApkFile, Device } from "../videoDevices.types";
import styles from "../VideoDevices.module.css";

type UpdateAppModalProps = {
  device: Device | null;
  apkFiles: ApkFile[];
  selectedApkName: string;
  apkFilesLoading: boolean;
  updatingApp: boolean;
  onSelectedApkNameChange: (value: string) => void;
  onClose: () => void;
  onUpdate: () => void;
};

export default function UpdateAppModal({
  device,
  apkFiles,
  selectedApkName,
  apkFilesLoading,
  updatingApp,
  onSelectedApkNameChange,
  onClose,
  onUpdate,
}: UpdateAppModalProps) {
  return (
    <Modal
      isOpen={Boolean(device)}
      onClose={onClose}
      title={device ? `Обновить приложение: ${device.locationName}` : "Обновить приложение"}
      panelClassName={styles.replaceModalPanel}
    >
      <div className={styles.form}>
        <Select
          label="APK файл"
          search
          value={selectedApkName}
          options={apkFiles.map((apk) => ({
            value: apk.name,
            label: `${apk.name} · ${apk.sizeInMb} МБ`,
          }))}
          placeholder={apkFilesLoading ? "Загрузка APK..." : "Выберите APK"}
          disabled={apkFilesLoading || updatingApp || apkFiles.length === 0}
          onChange={(event) => onSelectedApkNameChange(event.target.value)}
        />

        {apkFiles.length === 0 && !apkFilesLoading && (
          <div className={styles.mutedText}>APK файлы в папке ВидеоТВ не найдены.</div>
        )}

        {updatingApp && (
          <div className={styles.updateProgress}>
            <div className={styles.updateProgressBar} />
            <span>Устанавливаю APK, затем перезапущу приложение...</span>
          </div>
        )}

        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={updatingApp}>
            Отмена
          </button>
          <button type="button" className={styles.primaryButton} onClick={onUpdate} disabled={!selectedApkName || updatingApp}>
            {updatingApp ? "Обновление..." : "Обновить"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
