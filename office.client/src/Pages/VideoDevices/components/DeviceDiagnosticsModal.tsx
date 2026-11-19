import { useEffect, useState } from "react";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import CloudSyncRoundedIcon from "@mui/icons-material/CloudSyncRounded";
import PowerSettingsNewRoundedIcon from "@mui/icons-material/PowerSettingsNewRounded";
import ScreenshotMonitorRoundedIcon from "@mui/icons-material/ScreenshotMonitorRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import SystemUpdateAltRoundedIcon from "@mui/icons-material/SystemUpdateAltRounded";
import VolumeUpRoundedIcon from "@mui/icons-material/VolumeUpRounded";
import Button from "../../../Components/Button/Button";
import ConfirmModal from "../../../Components/ConfirmModal/ConfirmModal";
import Modal from "../../../Components/Modal/Modal";
import type { Device, DeviceActionState, DeviceCommand } from "../videoDevices.types";
import { canManageWithoutAdb, canScreenshot, describePresence, diagnosticFacts, formatSince, problemCount, problemsLabel } from "../videoDevices.utils";
import styles from "../VideoDevices.module.css";

type DeviceDiagnosticsModalProps = {
  device: Device | null;
  actionState?: DeviceActionState;
  onClose: () => void;
  /** arg — громкость (volume). */
  onCommand: (device: Device, command: DeviceCommand, arg?: string | number) => void;
  onScreenshot: (device: Device) => void;
  onReload: (device: Device) => void;
  /** Открыть выбор APK; приложение 2.0 обновится командой, без ADB. */
  onUpdateApp?: (device: Device) => void;
  /** Обновление командой отправлено и ждёт подтверждения. */
  updatePending?: boolean;
  /** Выдать права владельца устройства через ADB (для приставок без root). */
  onGrantOwner?: (device: Device) => void;
};

/**
 * Диагностика приставки: что с ней сейчас (проблемы, замечания, факты из сигнала) и действия без ADB.
 * Данные — из сигнала «я на связи» (приложение 2.0+), обновляются вместе со страницей раз в минуту.
 */
export default function DeviceDiagnosticsModal({
  device,
  actionState,
  onClose,
  onCommand,
  onScreenshot,
  onReload,
  onUpdateApp,
  updatePending,
  onGrantOwner,
}: DeviceDiagnosticsModalProps) {
  const [volume, setVolume] = useState("");
  const [confirmReboot, setConfirmReboot] = useState(false);

  useEffect(() => {
    setConfirmReboot(false);
    setVolume(device?.presence?.volumePercent != null ? String(device.presence.volumePercent) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- громкость подставляем при открытии, а не при каждом сигнале
  }, [device?.guid]);
  const volumeValue = volume.trim() === "" ? NaN : Number(volume);
  const volumeValid = Number.isInteger(volumeValue) && volumeValue >= 0 && volumeValue <= 100;

  const presence = device?.presence ?? null;
  const view = presence ? describePresence(presence) : null;
  const facts = presence ? diagnosticFacts(presence) : [];
  // Фоновая проверка связи по 8080 (её страница гоняет по всем приставкам) команды не блокирует —
  // кнопки заняты только пока выполняется действие из этого окна.
  const busy = Boolean(actionState?.loading && actionState.loading !== "check");
  const isOffline = presence?.status === "offline";
  const selfManaged = canManageWithoutAdb(presence);
  const screenshotAllowed = canScreenshot(presence);
  const noRights = presence?.hasRoot === false && presence?.deviceOwner !== true;
  const toneClass =
    view?.tone === "success" ? styles.presenceSuccess :
    view?.tone === "warning" ? styles.presenceWarning :
    view?.tone === "neutral" ? styles.presenceNeutral : styles.presenceDanger;

  return (
    <>
      <Modal
        isOpen={Boolean(device)}
        onClose={onClose}
        title={device ? `Диагностика: ${device.locationName || "Без ТТ"}` : "Диагностика"}
        panelClassName={styles.diagnosticsPanel}
      >
        {device && (
          <div className={styles.diagnostics}>
            {presence && view ? (
              <>
                <div className={styles.diagnosticsSummary}>
                  <span className={`${styles.presencePill} ${styles.diagnosticsPill} ${toneClass}`}>
                    <span className={styles.presenceDot} aria-hidden="true" />
                    <span className={styles.presenceText}>{problemCount(presence) > 1 ? problemsLabel(problemCount(presence)) : view.label}</span>
                  </span>
                  <span className={styles.diagnosticsMeta}>
                    {device.ip} · сигнал {formatSince(presence.lastSeenUtc) === "только что" ? "только что" : `${formatSince(presence.lastSeenUtc)} назад`}
                  </span>
                </div>

                {isOffline && (
                  <div className={`${styles.diagnosticsOffline} ${presence.attention ? styles.diagnosticsOfflineAttention : ""}`}>
                    {presence.attention
                      ? presence.problems.length > 0
                        ? "Связь пропала, когда на приставке уже была проблема — стоит проверить на месте."
                        : "Связи нет больше суток — стоит позвонить на точку."
                      : "Скорее всего, пропал интернет на точке. Приставка продолжает показывать то, что уже скачано; когда связь вернётся, она сообщит, шёл ли контент всё это время."}
                  </div>
                )}

                {presence.problems.length > 0 && (
                  <section className={styles.diagnosticsSection}>
                    <h3 className={styles.diagnosticsHeading}>
                      {isOffline ? "Перед пропажей связи" : "Проблемы"} · {presence.problems.length}
                    </h3>
                    <ul className={`${styles.diagnosticsList} ${styles.diagnosticsProblems}`}>
                      {presence.problems.map((problem) => (
                        <li key={problem}>{problem}</li>
                      ))}
                    </ul>
                  </section>
                )}

                {(presence.notices?.length ?? 0) > 0 && !isOffline && (
                  <section className={styles.diagnosticsSection}>
                    <h3 className={styles.diagnosticsHeading}>Замечания</h3>
                    <ul className={`${styles.diagnosticsList} ${styles.diagnosticsNotices}`}>
                      {presence.notices!.map((notice) => (
                        <li key={notice}>{notice}</li>
                      ))}
                    </ul>
                  </section>
                )}

                <section className={styles.diagnosticsSection}>
                  <h3 className={styles.diagnosticsHeading}>{isOffline ? "Последний сигнал" : "Состояние"}</h3>
                  <dl className={styles.diagnosticsFacts}>
                    {facts.map((fact) => (
                      <div
                        key={fact.label}
                        className={`${styles.diagnosticsFact} ${fact.wide ? styles.diagnosticsFactWide : ""} ${
                          fact.tone === "danger" ? styles.diagnosticsFactDanger : fact.tone === "warning" ? styles.diagnosticsFactWarning : ""
                        }`}
                      >
                        <dt>{fact.label}</dt>
                        <dd title={fact.value}>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </>
            ) : (
              <div className={styles.mutedText}>
                Приставка не присылает сигналы — на ней старое приложение. Диагностика появится после обновления до 2.0.
              </div>
            )}

            <section className={styles.diagnosticsSection}>
              <h3 className={styles.diagnosticsHeading}>Действия</h3>
              {isOffline && <div className={styles.diagnosticsHint}>Приставка не на связи — команды, скорее всего, не дойдут.</div>}
              <div className={styles.diagnosticsActions}>
                <Button
                  size="sm"
                  leadingIcon={<CloudSyncRoundedIcon fontSize="small" />}
                  loading={actionState?.loading === "sync"}
                  disabled={busy}
                  onClick={() => onCommand(device, "sync")}
                  title="Получить настройки и докачать новое сразу, не дожидаясь часовой проверки"
                >
                  Синхронизировать
                </Button>
                <Button
                  size="sm"
                  leadingIcon={<ScreenshotMonitorRoundedIcon fontSize="small" />}
                  loading={actionState?.loading === "screenshot"}
                  disabled={busy || !screenshotAllowed}
                  title={screenshotAllowed ? undefined : "Скриншот снимается через root, а на этой приставке его нет"}
                  onClick={() => onScreenshot(device)}
                >
                  Скриншот
                </Button>
                <Button
                  size="sm"
                  leadingIcon={<SyncRoundedIcon fontSize="small" />}
                  loading={actionState?.loading === "reload"}
                  disabled={busy}
                  onClick={() => onReload(device)}
                >
                  Перезапустить приложение
                </Button>
                {onUpdateApp && presence && (
                  <Button
                    size="sm"
                    leadingIcon={<SystemUpdateAltRoundedIcon fontSize="small" />}
                    loading={actionState?.loading === "update" || updatePending}
                    disabled={busy || updatePending}
                    onClick={() => onUpdateApp(device)}
                    title={
                      selfManaged
                        ? "Приставка сама скачает APK с портала и установит его — без ADB"
                        : "Нет root и прав владельца — обновление пойдёт через ADB"
                    }
                  >
                    {updatePending ? "Обновляется…" : "Обновить приложение"}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="danger"
                  leadingIcon={<PowerSettingsNewRoundedIcon fontSize="small" />}
                  loading={actionState?.loading === "reboot"}
                  disabled={busy || !selfManaged}
                  title={selfManaged ? undefined : "Нет root и прав владельца устройства — перезагрузить можно только через ADB"}
                  onClick={() => setConfirmReboot(true)}
                >
                  Перезагрузить приставку
                </Button>
              </div>

              {noRights && onGrantOwner && (
                <div className={styles.diagnosticsOffline}>
                  На приставке нет root. Можно один раз через ADB сделать приложение «владельцем устройства» — тогда
                  обновления и перезагрузка пойдут без ADB. Android откажет, если на приставке добавлены аккаунты (например, Google)
                  или прошивка не поддерживает администрирование. Учтите: на части прошивок (X96Q) права потом не снимаются без
                  root или сброса, а приложение нельзя удалить, пока права есть.
                  <div className={styles.diagnosticsActions} style={{ marginTop: 8 }}>
                    <Button
                      size="sm"
                      leadingIcon={<AdminPanelSettingsRoundedIcon fontSize="small" />}
                      loading={actionState?.loading === "grantOwner"}
                      disabled={busy}
                      onClick={() => onGrantOwner(device)}
                    >
                      Выдать права владельца (ADB)
                    </Button>
                  </div>
                </div>
              )}
              {presence?.deviceOwner && (
                <div className={styles.diagnosticsHint}>
                  Приложение — владелец устройства.{" "}
                  <button type="button" className={styles.diagnosticsLinkButton} disabled={busy} onClick={() => onCommand(device, "owner-release")}>
                    Снять права
                  </button>
                </div>
              )}

              <form
                className={styles.diagnosticsRedownload}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (volumeValid) onCommand(device, "volume", volumeValue);
                }}
              >
                <label className={styles.diagnosticsLabel} htmlFor="diagnostics-volume">
                  Громкость музыки, %
                </label>
                <div className={styles.diagnosticsRedownloadRow}>
                  <input
                    id="diagnostics-volume"
                    className={`${styles.diagnosticsInput} ${styles.diagnosticsVolumeInput}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={100}
                    step={5}
                    placeholder="0–100"
                    value={volume}
                    onChange={(event) => setVolume(event.target.value)}
                  />
                  <Button
                    size="sm"
                    type="submit"
                    leadingIcon={<VolumeUpRoundedIcon fontSize="small" />}
                    loading={actionState?.loading === "volume"}
                    disabled={busy || !volumeValid}
                  >
                    Установить
                  </Button>
                </div>
                <span className={styles.diagnosticsHint}>
                  Системная громкость приставки. Тишину по расписанию не отменяет. Шаги у приставок разные — ответ покажет, что получилось.
                </span>
              </form>
            </section>
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={confirmReboot && Boolean(device)}
        title="Перезагрузить приставку?"
        message={`${device?.locationName ?? ""}: экран погаснет примерно на минуту, затем приложение запустится само.`}
        onCancel={() => setConfirmReboot(false)}
        onConfirm={() => {
          setConfirmReboot(false);
          if (device) onCommand(device, "reboot");
        }}
        confirmLabel="Перезагрузить"
        cancelLabel="Отмена"
      />
    </>
  );
}
