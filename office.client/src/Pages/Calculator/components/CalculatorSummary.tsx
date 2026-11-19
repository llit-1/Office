import type { ReactNode } from "react";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import TimerOutlinedIcon from "@mui/icons-material/TimerOutlined";
import { plural } from "../calculator.plan";
import { formatLeft } from "../useSessionTimer";
import type { Summary } from "../calculator.rows";
import styles from "../CalculatorPage.module.css";

interface CalculatorSummaryProps {
  summary: Summary;
  /** Состояние сохранения; null — ещё ничего не сохраняли. */
  status: { tone: string; text: string; action?: ReactNode } | null;
  /** Сколько секунд осталось в сессии; null — сессия ещё не известна. */
  sessionLeft: number | null;
  action: ReactNode;
}

/** Последние пять минут сессии подсвечиваем. */
const SESSION_WARN_SECONDS = 5 * 60;

/** Короткий итог: сколько ввели и что получилось. */
export default function CalculatorSummary({ summary, status, sessionLeft, action }: CalculatorSummaryProps) {
  return (
    <aside className={styles.summary} aria-label="Итог" data-sandwich={summary.buns !== null || undefined}>
      <dl className={styles.summaryStats}>
        <div>
          <dt>Введено</dt>
          <dd>{summary.entered} <small>из {summary.total}</small></dd>
        </div>
        <div>
          <dt>План</dt>
          <dd>{summary.plan} <small>шт</small></dd>
        </div>
        <div data-accent>
          <dt>Факт</dt>
          <dd>{summary.taken} <small>шт</small></dd>
        </div>
        {summary.buns !== null ? (
          <div>
            <dt>Булок</dt>
            <dd>{summary.buns} <small>{plural(summary.buns, "булка", "булки", "булок")}</small></dd>
          </div>
        ) : null}
      </dl>
      <div className={styles.summarySide}>
        {sessionLeft !== null ? (
          <p className={styles.status} data-tone={sessionLeft <= SESSION_WARN_SECONDS ? "warn" : undefined} title="До конца сессии">
            <TimerOutlinedIcon aria-hidden="true" />
            <span className={styles.sessionLeft}>{formatLeft(sessionLeft)}</span>
          </p>
        ) : null}
        {status ? (
          <p className={styles.status} role="status" data-tone={status.tone}>
            {status.tone === "ok" ? <CheckRoundedIcon aria-hidden="true" /> : null}
            {status.text}
            {status.action}
          </p>
        ) : null}
        {action}
      </div>
    </aside>
  );
}
