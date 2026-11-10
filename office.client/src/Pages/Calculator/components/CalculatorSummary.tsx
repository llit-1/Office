import type { ReactNode } from "react";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import { plural } from "../calculator.plan";
import type { Summary } from "../calculator.rows";
import styles from "../CalculatorPage.module.css";

interface CalculatorSummaryProps {
  summary: Summary;
  /** Состояние сохранения; null — ещё ничего не сохраняли. */
  status: { tone: string; text: string; action?: ReactNode } | null;
  action: ReactNode;
}

/** Короткий итог: сколько ввели и что получилось. */
export default function CalculatorSummary({ summary, status, action }: CalculatorSummaryProps) {
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
