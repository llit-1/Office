import MonitorHeartRoundedIcon from "@mui/icons-material/MonitorHeartRounded";
import MusicNoteRoundedIcon from "@mui/icons-material/MusicNoteRounded";
import OndemandVideoRoundedIcon from "@mui/icons-material/OndemandVideoRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ScreenshotMonitorRoundedIcon from "@mui/icons-material/ScreenshotMonitorRounded";
import SyncRoundedIcon from "@mui/icons-material/SyncRounded";
import SystemUpdateAltRoundedIcon from "@mui/icons-material/SystemUpdateAltRounded";
import WifiTetheringRoundedIcon from "@mui/icons-material/WifiTetheringRounded";
import type { Device, DeviceActionState } from "../videoDevices.types";
import { canScreenshot, connectionStatus, describePresence, isNewerVersion, isOutdatedVersion, parseVideoNames, problemCount, problemsLabel } from "../videoDevices.utils";
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
  onDiagnostics?: (device: Device) => void;
};

/** С этого числа проблем карточка выделяется отдельно: «что-то сломалось всерьёз, загляни в диагностику». */
export const MANY_PROBLEMS = 2;

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
  onDiagnostics,
}: DeviceCardProps) {
  const videoNames = parseVideoNames(device.videoList);
  const isMusic = device.onlyMusic === 1;
  const versionMatches = Boolean(serverVersion && device.version && serverVersion === device.version);
  // Устарела — только версия старше серверной. Более новая (тестовая) показывается синей и не обновляется «назад».
  const versionMismatch = isOutdatedVersion(device.version, serverVersion);
  const versionNewer = isNewerVersion(device.version, serverVersion);
  // Для 2.0 связь — по сигналу приставки (без проверки по 8080), для старого приложения — по проверке
  const status = connectionStatus(device, actionState);
  const isOnline = status === "online";
  const isPing = status === "ping";
  const canUpdateApp = versionMismatch && status !== "offline";
  // Сигнал приставки (2.0+) надёжнее проверки по 8080: он говорит, что контент реально показывается.
  // Для старого приложения сигналов нет — цвет по-прежнему по проверке связи.
  const presenceView = device.presence ? describePresence(device.presence) : null;
  const tone =
    presenceView?.tone ??
    (actionState?.status === "online"
      ? "success"
      : actionState?.status === "ping"
        ? "warning"
        : actionState?.status === "offline"
          ? "danger"
          : null);
  const problems = problemCount(device.presence);
  const manyProblems = problems >= MANY_PROBLEMS;
  const cardStateClass =
    tone === "success" ? dashboard.cardSuccess : tone === "warning" ? dashboard.cardWarning : tone === "danger" ? dashboard.cardDanger : "";
  const statusDotClass =
    tone === "success" ? dashboard.statusSuccess : tone === "warning" ? dashboard.statusWarning : tone === "danger" ? dashboard.statusDanger : "";

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${dashboard.card} ${cardStateClass} ${
        manyProblems ? (tone === "danger" ? styles.cardManyProblems : styles.cardManyWarnings) : ""
      }`}
      onClick={() => onOpen(device)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(device);
        }
      }}
    >
      {!presenceView && <span className={`${dashboard.statusDot} ${statusDotClass}`} aria-hidden="true" />}
      <div className={styles.deviceHeader}>
        <div className={styles.deviceIdentity}>
          <span className={styles.deviceTitleRow}>
            <span className={styles.deviceTitle}>{device.locationName || "Без ТТ"}</span>
            {presenceView && (
              <span
                className={`${styles.presencePill} ${
                  presenceView.tone === "success"
                    ? styles.presenceSuccess
                    : presenceView.tone === "warning"
                      ? styles.presenceWarning
                      : presenceView.tone === "neutral"
                        ? styles.presenceNeutral
                        : styles.presenceDanger
                }`}
                title={[presenceView.label, presenceView.details].join("\n")}
              >
                <span className={styles.presenceDot} aria-hidden="true" />
                {/* Несколько проблем: первая из них в узкой плашке не читается — пишем, сколько их; список — в подсказке и диагностике */}
                <span className={styles.presenceText}>{manyProblems ? problemsLabel(problems) : presenceView.label}</span>
              </span>
            )}
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
            <span
              className={`${styles.versionBadge} ${
                versionMatches ? styles.versionOk : versionMismatch ? styles.versionWarning : versionNewer ? styles.versionNewer : ""
              }`}
              title={versionNewer ? `Новее серверной (${serverVersion})` : versionMismatch ? `Сервер: ${serverVersion}` : undefined}
            >
              {device.version}
            </span>
          )}
          <span className={`${styles.typeBadge} ${isMusic ? styles.musicBadge : ""}`}>
            {isMusic ? <MusicNoteRoundedIcon fontSize="small" /> : <OndemandVideoRoundedIcon fontSize="small" />}
          </span>
        </div>

        <div className={dashboard.cardActions} onClick={(event) => event.stopPropagation()}>
          {device.presence && onDiagnostics && (
            <button
              type="button"
              className={`${dashboard.cardActionButton} ${
                manyProblems ? (tone === "danger" ? styles.diagnosticsButtonAlert : styles.diagnosticsButtonWarn) : ""
              }`}
              onClick={() => onDiagnostics(device)}
              title={manyProblems ? `Диагностика: проблем ${problems}` : "Диагностика"}
              aria-label="Диагностика"
            >
              <MonitorHeartRoundedIcon fontSize="small" />
            </button>
          )}
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
              {canScreenshot(device.presence) && (
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
              )}
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
