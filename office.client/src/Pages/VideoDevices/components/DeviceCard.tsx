import MusicNoteRoundedIcon from "@mui/icons-material/MusicNoteRounded";
import OndemandVideoRoundedIcon from "@mui/icons-material/OndemandVideoRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ScreenshotMonitorRoundedIcon from "@mui/icons-material/ScreenshotMonitorRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import SystemUpdateAltRoundedIcon from "@mui/icons-material/SystemUpdateAltRounded";
import WifiTetheringRoundedIcon from "@mui/icons-material/WifiTetheringRounded";
import type { Device, DeviceActionState } from "../videoDevices.types";
import { parseVideoNames } from "../videoDevices.utils";
import styles from "../VideoDevices.module.css";
import dashboard from "../../../styles/entity-dashboard.module.css";

type DeviceCardProps = {
  device: Device;
  serverVersion: string;
  actionState?: DeviceActionState;
  onOpen: (device: Device) => void;
  onCheck: (device: Device) => void;
  onStartApp: (device: Device) => void;
  onUpdateApp: (device: Device) => void;
  onScreenshot: (device: Device) => void;
  onReload: (device: Device) => void;
};

export default function DeviceCard({
  device,
  serverVersion,
  actionState,
  onOpen,
  onCheck,
  onStartApp,
  onUpdateApp,
  onScreenshot,
  onReload,
}: DeviceCardProps) {
  const videoNames = parseVideoNames(device.videoList);
  const isMusic = device.onlyMusic === 1;
  const versionMatches = Boolean(serverVersion && device.version && serverVersion === device.version);
  const versionMismatch = Boolean(serverVersion && device.version && serverVersion !== device.version);
  const isOnline = actionState?.status === "online";
  const isPing = actionState?.status === "ping";
  const canUpdateApp = versionMismatch && actionState?.status !== "offline";
  const cardStateClass =
    actionState?.status === "online"
      ? dashboard.cardSuccess
      : actionState?.status === "offline"
        ? dashboard.cardDanger
        : actionState?.status === "ping"
          ? dashboard.cardWarning
          : "";
  const statusDotClass =
    actionState?.status === "online"
      ? dashboard.statusSuccess
      : actionState?.status === "ping"
        ? dashboard.statusWarning
        : actionState?.status === "offline"
          ? dashboard.statusDanger
          : "";

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${dashboard.card} ${cardStateClass}`}
      onClick={() => onOpen(device)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(device);
        }
      }}
    >
      <span className={`${dashboard.statusDot} ${statusDotClass}`} aria-hidden="true" />
      <div className={styles.deviceHeader}>
        <div className={styles.deviceIdentity}>
          <span className={styles.deviceTitleRow}>
            <span className={styles.deviceTitle}>{device.locationName || "Без ТТ"}</span>
          </span>
          <span className={styles.deviceIp}>{device.ip}</span>
          <span className={`${styles.videoBadge} ${videoNames.length === 0 ? styles.videoBadgeEmpty : ""}`} title={videoNames.join(", ")}>
            {videoNames.length > 0 ? videoNames.join(", ") : "—"}
          </span>
        </div>
      </div>

      <div className={styles.cardFooter}>
        <div className={styles.cardMeta}>
          {device.version && (
            <span className={`${styles.versionBadge} ${versionMatches ? styles.versionOk : versionMismatch ? styles.versionWarning : ""}`}>
              {device.version}
            </span>
          )}
          <span className={`${styles.typeBadge} ${isMusic ? styles.musicBadge : ""}`}>
            {isMusic ? <MusicNoteRoundedIcon fontSize="small" /> : <OndemandVideoRoundedIcon fontSize="small" />}
          </span>
        </div>

        <div className={dashboard.cardActions} onClick={(event) => event.stopPropagation()}>
          {!isOnline && (
            <button
              type="button"
              className={dashboard.cardActionButton}
              onClick={() => onCheck(device)}
              disabled={Boolean(actionState?.loading)}
              title="Проверить связь и версию"
              aria-label="Проверить связь и версию"
            >
              {actionState?.loading === "check" ? (
                <span className={styles.buttonSpinner} aria-hidden="true" />
              ) : (
                <WifiTetheringRoundedIcon fontSize="small" />
              )}
            </button>
          )}
          {isPing && (
            <button
              type="button"
              className={dashboard.cardActionButton}
              onClick={() => onStartApp(device)}
              disabled={Boolean(actionState?.loading)}
              title="Запустить приложение через ADB"
              aria-label="Запустить приложение через ADB"
            >
              {actionState?.loading === "startApp" ? (
                <span className={styles.buttonSpinner} aria-hidden="true" />
              ) : (
                <PlayArrowRoundedIcon fontSize="small" />
              )}
            </button>
          )}
          {canUpdateApp && (
            <button
              type="button"
              className={dashboard.cardActionButton}
              onClick={() => onUpdateApp(device)}
              disabled={Boolean(actionState?.loading)}
              title="Обновить приложение"
              aria-label="Обновить приложение"
            >
              {actionState?.loading === "updateApp" ? (
                <span className={styles.buttonSpinner} aria-hidden="true" />
              ) : (
                <SystemUpdateAltRoundedIcon fontSize="small" />
              )}
            </button>
          )}
          {isOnline && (
            <>
              <button
                type="button"
                className={dashboard.cardActionButton}
                onClick={() => onScreenshot(device)}
                disabled={Boolean(actionState?.loading)}
                title="Получить скриншот"
                aria-label="Получить скриншот"
              >
                <ScreenshotMonitorRoundedIcon fontSize="small" />
              </button>
              <button
                type="button"
                className={`${dashboard.cardActionButton} ${styles.reloadButton}`}
                onClick={() => onReload(device)}
                disabled={Boolean(actionState?.loading)}
                title="Перезапустить приложение"
                aria-label="Перезапустить приложение"
              >
                <SyncRoundedIcon fontSize="small" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
