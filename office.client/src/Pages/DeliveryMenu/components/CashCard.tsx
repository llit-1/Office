import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import SystemUpdateAltRoundedIcon from "@mui/icons-material/SystemUpdateAltRounded";
import type { CashClient, CashTask, CashVersion } from "../cash.api";
import { cashTitle, installedVersion, MISSING_VERSION, taskProgress, type TaskState, type VersionState } from "../cashClients.utils";
import dashboard from "../../../styles/entity-dashboard.module.css";
import styles from "../CashUpdate.module.css";

interface CashCardProps {
  cash: CashClient;
  versions: CashVersion[];
  /** Версия, которую кассы ставят по умолчанию: по ней карточка красится. */
  actualVersion: string | null;
  /** Список версий загружен: без него номер и отставание не показываются. */
  versionsLoaded: boolean;
  task: CashTask | undefined;
  /** Над кассой выполняется действие из портала (ставится задача). */
  pending: boolean;
  onInstall: (cash: CashClient) => void;
  onDelete: (cash: CashClient) => void;
}

const cardTone: Record<VersionState, string> = {
  actual: dashboard.cardSuccess,
  outdated: dashboard.cardWarning,
  unknown: dashboard.cardInactive,
};

const hoverTone: Record<VersionState, string> = {
  actual: styles.cashToneActual,
  outdated: styles.cashToneOutdated,
  unknown: styles.cashToneUnknown,
};

const taskTone: Record<TaskState, string> = {
  queued: styles.taskQueued,
  running: styles.taskRunning,
  done: styles.taskDone,
};

function formatConnection(value: string | null) {
  if (!value) return "не выходила на связь";
  const date = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}+03:00`);
  if (Number.isNaN(date.getTime())) return "не выходила на связь";
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Moscow" }).format(date);
}

export default function CashCard({ cash, versions, actualVersion, versionsLoaded, task, pending, onInstall, onDelete }: CashCardProps) {
  const { label: installed, state } = installedVersion(cash, versions, actualVersion, versionsLoaded);
  const progress = taskProgress(task, versions);
  const busy = pending || progress?.state === "queued" || progress?.state === "running";
  const title = cashTitle(cash);

  return (
    <div className={`${dashboard.card} ${cardTone[state]} ${hoverTone[state]} ${styles.cashCard}`}>
      <div className={styles.cashIdentity}>
        <span className={styles.cashTitle} title={title}>{title}</span>
        <span className={styles.cashIp}>{cash.ip ?? "IP не задан"}</span>
        <span className={styles.cashSeen}>{formatConnection(cash.lastConnection)}</span>
      </div>

      {progress && (
        <div className={`${styles.task} ${taskTone[progress.state]}`} role="status"
          aria-label={`${progress.title}: ${progress.stageLabel}`}>
          <div className={styles.taskHeader}>
            <span className={styles.taskTitleRow}>
              <span className={styles.taskTitle} title={progress.title}>{progress.title}</span>
              {progress.state === "running" && <span className={styles.taskStep}>{progress.step} из {progress.total}</span>}
            </span>
            <span className={styles.taskStage}>
              {progress.state === "running" && <span className={styles.cashSpinner} aria-hidden="true" />}
              <span className={styles.taskStageText} title={progress.stageLabel}>{progress.stageLabel}</span>
            </span>
          </div>
          <div className={styles.taskTrack} aria-hidden="true">
            {Array.from({ length: progress.total }, (_, index) => (
              <span key={index} className={styles.taskSegment}
                data-filled={index < progress.step || undefined}
                data-current={(progress.state === "running" && index === progress.step) || undefined} />
            ))}
          </div>
        </div>
      )}

      <div className={styles.cashFooter}>
        <span className={`${styles.cashVersion} ${state === "actual" ? styles.cashVersionOk : state === "outdated" ? styles.cashVersionWarning : ""}`}
          title={installed === MISSING_VERSION
            ? "Установленной версии больше нет в списке"
            : state === "outdated" && actualVersion ? `На кассах должна быть ${actualVersion}` : undefined}>
          {installed ?? (cash.cashVersionId != null ? "…" : "версия неизвестна")}
        </span>

        <div className={dashboard.cardActions}>
          <button
            type="button"
            className={dashboard.cardActionButton}
            onClick={() => onInstall(cash)}
            disabled={busy}
            title={busy ? "У кассы уже есть задача" : "Установить версию: обновить или откатить"}
            aria-label={`Обновить кассу ${title}`}
          >
            {pending
              ? <span className={styles.cashSpinner} aria-hidden="true" />
              : <SystemUpdateAltRoundedIcon fontSize="small" />}
          </button>
          <button
            type="button"
            className={`${dashboard.cardActionButton} ${styles.cardDeleteButton}`}
            onClick={() => onDelete(cash)}
            disabled={busy}
            title={busy ? "У кассы уже есть задача" : "Удалить кассовый клиент с компьютера"}
            aria-label={`Удалить клиент с кассы ${title}`}
          >
            <DeleteOutlineRoundedIcon fontSize="small" />
          </button>
        </div>
      </div>
    </div>
  );
}
