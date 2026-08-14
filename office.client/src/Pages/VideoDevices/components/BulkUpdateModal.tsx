import Checkbox from "../../../Components/Checkbox/Checkbox";
import Button from "../../../Components/Button/Button";
import Modal from "../../../Components/Modal/Modal";
import Select from "../../../Components/Select/Select";
import type { ApkFile, BulkUpdateStatus, Device } from "../videoDevices.types";
import styles from "../VideoDevices.module.css";

type BulkProgress = {
  current: number;
  total: number;
  deviceName?: string;
};

type BulkUpdateModalProps = {
  isOpen: boolean;
  outdatedDevices: Device[];
  selectedDevices: Device[];
  selectedGuids: string[];
  selectedApkName: string;
  apkFiles: ApkFile[];
  apkFilesLoading: boolean;
  updating: boolean;
  progress: BulkProgress | null;
  statuses: Record<string, BulkUpdateStatus>;
  serverVersion: string;
  onSelectedApkNameChange: (value: string) => void;
  onToggleDevice: (deviceGuid: string) => void;
  onSelectAll: (selected: boolean) => void;
  onClose: () => void;
  onUpdate: () => void;
};

export default function BulkUpdateModal({
  isOpen,
  outdatedDevices,
  selectedDevices,
  selectedGuids,
  selectedApkName,
  apkFiles,
  apkFilesLoading,
  updating,
  progress,
  statuses,
  serverVersion,
  onSelectedApkNameChange,
  onToggleDevice,
  onSelectAll,
  onClose,
  onUpdate,
}: BulkUpdateModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Массовое обновление приложений" panelClassName={styles.bulkUpdateModalPanel}>
      <div className={styles.form}>
        <div className={styles.bulkUpdateToolbar}>
          <span className={styles.mutedText}>
            Выбрано {selectedDevices.length} из {outdatedDevices.length}
          </span>
          <div className={styles.bulkUpdateSelectionActions}>
            <Button size="sm" variant="secondary" onClick={() => onSelectAll(true)} disabled={updating}>
              Выбрать все
            </Button>
            <Button size="sm" variant="secondary" onClick={() => onSelectAll(false)} disabled={updating}>
              Снять все
            </Button>
          </div>
        </div>

        <div className={styles.bulkUpdateList}>
          {outdatedDevices.length === 0 ? (
            <div className={styles.mutedText}>Устройств с неактуальной версией нет.</div>
          ) : (
            outdatedDevices.map((device) => {
              const status = statuses[device.guid];
              return (
                <Checkbox
                  key={device.guid}
                  size="sm"
                  labelClassName={styles.bulkUpdateRow}
                  label={
                    <span className={styles.bulkUpdateRowContent}>
                      <span className={styles.bulkUpdateDeviceInfo}>
                        <span className={styles.bulkUpdateDeviceName}>{device.locationName}</span>
                        <span className={styles.bulkUpdateDeviceMeta}>
                          {device.ip} · версия {device.version || "не указана"} → {serverVersion}
                        </span>
                      </span>
                      {status && (
                        <span
                          className={`${styles.bulkUpdateStatus} ${
                            status.state === "success"
                              ? styles.bulkUpdateStatusSuccess
                              : status.state === "error"
                                ? styles.bulkUpdateStatusError
                                : status.state === "updating"
                                  ? styles.bulkUpdateStatusUpdating
                                  : styles.bulkUpdateStatusPending
                          }`}
                          title={status.message}
                        >
                          {status.message}
                        </span>
                      )}
                    </span>
                  }
                  checked={selectedGuids.includes(device.guid)}
                  onChange={() => onToggleDevice(device.guid)}
                  disabled={updating}
                  aria-label={`Выбрать ${device.locationName}`}
                />
              );
            })
          )}
        </div>

        <Select
          label="APK файл"
          search
          value={selectedApkName}
          options={apkFiles.map((apk) => ({
            value: apk.name,
            label: `${apk.name} · ${apk.sizeInMb} МБ`,
          }))}
          placeholder={apkFilesLoading ? "Загрузка APK..." : "Выберите APK"}
          disabled={apkFilesLoading || updating || apkFiles.length === 0}
          onChange={(event) => onSelectedApkNameChange(event.target.value)}
        />

        {apkFiles.length === 0 && !apkFilesLoading && (
          <div className={styles.mutedText}>APK файлы в папке ВидеоТВ не найдены.</div>
        )}

        {updating && progress && (
          <div className={styles.updateProgress}>
            <div className={styles.updateProgressBar} />
            <span>
              {progress.current} из {progress.total}: {progress.deviceName}
            </span>
          </div>
        )}

        <div className={styles.modalActions}>
          <Button variant="secondary" onClick={onClose} disabled={updating}>
            Отмена
          </Button>
          <Button
            variant="primary"
            onClick={onUpdate}
            disabled={!selectedApkName || selectedDevices.length === 0}
            loading={updating}
          >
            {updating ? "Обновление..." : "Обновить выбранные"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
