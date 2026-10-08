import { useState } from "react";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import LoadingSpinner from "../../../Components/LoadingSpinner/LoadingSpinner";
import StatusBadge from "../../../Components/StatusBadge/StatusBadge";
import type { OrderLogEntry } from "../deliveryRequests.types";
import { describeLogEntry, errorSummary } from "../orderLogs.utils";
import styles from "../DeliveryRequests.module.css";

type OrderLogsProps = {
  entries: OrderLogEntry[];
  loading: boolean;
  error: string;
};

const formatTime = (value: string) =>
  new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

function durationMs(entry: OrderLogEntry): number | null {
  if (!entry.datetimeEnd) return null;
  const ms = new Date(entry.datetimeEnd).getTime() - new Date(entry.datetimeBegin).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** Тело и текст ошибки приходят JSON-строкой; красиво форматируем, а не-JSON показываем как есть. */
function pretty(text: string | null): string | null {
  if (!text?.trim()) return null;
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function LogEntry({ entry }: { entry: OrderLogEntry }) {
  const [open, setOpen] = useState(false);
  const failed = entry.statusCode !== null && entry.statusCode >= 400;
  const duration = durationMs(entry);
  const body = pretty(entry.body);
  const errorText = pretty(entry.errorText);
  const summary = errorSummary(entry.errorText);

  return (
    <li className={`${styles.logEntry} ${failed ? styles.logEntryFailed : ""}`}>
      <button type="button" className={styles.logHeader} onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className={styles.logTime}>{formatTime(entry.datetimeBegin)}</span>
        <span className={styles.logTitle}>
          <strong>{describeLogEntry(entry)}</strong>
          <code>{entry.type.toUpperCase()} {entry.url}</code>
        </span>
        {entry.statusCode !== null ? (
          <StatusBadge tone={failed ? "danger" : "success"}>{entry.statusCode}</StatusBadge>
        ) : null}
        <ExpandMoreRoundedIcon fontSize="small" className={`${styles.logChevron} ${open ? styles.logChevronOpen : ""}`} aria-hidden="true" />
      </button>

      {failed && summary.length > 0 ? (
        <ul className={styles.logErrors}>
          {summary.map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : null}

      {open ? (
        <div className={styles.logBody}>
          <dl className={styles.logMeta}>
            {entry.clientId ? <div><dt>Клиент</dt><dd>{entry.clientId}</dd></div> : null}
            {entry.ipAddress ? <div><dt>IP</dt><dd>{entry.ipAddress}</dd></div> : null}
            {duration !== null ? <div><dt>Длительность</dt><dd>{duration} мс</dd></div> : null}
          </dl>
          {body ? (
            <>
              <span className={styles.logLabel}>Тело запроса</span>
              <pre className={styles.raw}>{body}</pre>
            </>
          ) : null}
          {errorText ? (
            <>
              <span className={styles.logLabel}>Ответ с ошибкой</span>
              <pre className={styles.raw}>{errorText}</pre>
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** Журнал запросов по заказу в хронологическом порядке: создание, смены статуса, отмена и ошибки. */
export default function OrderLogs({ entries, loading, error }: OrderLogsProps) {
  const sorted = [...entries].sort((left, right) =>
    new Date(left.datetimeBegin).getTime() - new Date(right.datetimeBegin).getTime());
  const failedCount = sorted.filter((entry) => entry.statusCode !== null && entry.statusCode >= 400).length;

  return (
    <section className={styles.orderSection} aria-label="Журнал запросов">
      <h3 className={styles.logHeading}>
        Журнал запросов
        {!loading && !error ? <span className={styles.panelCount}>{sorted.length}</span> : null}
        {failedCount > 0 ? <StatusBadge tone="danger">Ошибок: {failedCount}</StatusBadge> : null}
      </h3>

      {loading ? (
        <div className={styles.logLoading}><LoadingSpinner size={36} label="Загружаем логи…" /></div>
      ) : error ? (
        <p className={styles.error} role="alert">{error}</p>
      ) : sorted.length === 0 ? (
        <p className={styles.empty}>По этому заказу запросов в журнале нет.</p>
      ) : (
        <ol className={styles.logList}>
          {sorted.map((entry) => <LogEntry key={entry.id} entry={entry} />)}
        </ol>
      )}
    </section>
  );
}
