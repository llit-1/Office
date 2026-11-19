import LockOpenOutlinedIcon from "@mui/icons-material/LockOpenOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import type { CalculatorCategory } from "../calculator.categories";
import { bunsFor, formatDuration } from "../calculator.plan";
import type { RowModel } from "../calculator.rows";
import styles from "../CalculatorPage.module.css";

interface CalculatorRowProps {
  row: RowModel;
  category: CalculatorCategory;
  /** Цвет метки режима печи, 0–3; null — у позиции режима нет, но место под метку держим ради ровных названий. */
  modeTone?: number | null;
  locking: boolean;
  onRest: (value: string) => void;
  onFact: (value: string) => void;
  onLock: () => void;
  onUnlock: () => void;
}

const digits = (value: string) => value.replace(/\D/g, "").slice(0, 4);

export default function CalculatorRow({ row, category, modeTone, locking, onRest, onFact, onLock, onUnlock }: CalculatorRowProps) {
  const { item, entry, plan } = row;
  const block = item.block;
  const locked = block !== null;
  const differs = plan !== null && entry.fact !== "" && Number(entry.fact) !== plan;
  const buns = item.bunsPer && row.taken ? bunsFor(row.taken, item.bunsPer) : null;
  // строка в одну линию: подробности — во всплывающей подсказке
  const details = [
    item.name,
    item.bunsPer ? `${item.bunsPer} шт из булки` : null,
    item.defrostMinutes ? `дефрост ${formatDuration(item.defrostMinutes)}` : null,
    item.bakingMode ? `режим ${item.bakingMode}` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className={styles.row} data-calculator-row data-locked={locked || undefined} data-entered={entry.rest !== "" || undefined}>
      <div className={styles.rowMain} data-sandwich={item.bunsPer ? true : undefined}>
        <div className={styles.name} title={block ? `${item.name} · ${block.text}` : details}>
          <span className={styles.itemLine}>
            {item.bakingMode ? (
              <span className={styles.mode} data-tone={modeTone ?? undefined}>{item.bakingMode}</span>
            ) : modeTone === null ? (
              <span className={styles.mode} data-empty aria-hidden="true" />
            ) : null}
            <span className={styles.itemName}>{item.name}</span>
          </span>
          {block ? <span className={styles.lockedNote}>{block.text}</span> : null}
        </div>

        <label className={`${styles.cell} ${styles.restCell}`}>
          <span className={styles.cellCaption}>Осталось</span>
          <input
            className={styles.input}
            inputMode="numeric"
            autoComplete="off"
            aria-label={`Осталось: ${item.name}`}
            value={entry.rest}
            disabled={locked}
            onChange={(event) => onRest(digits(event.target.value))}
          />
        </label>

        <div className={`${styles.cell} ${styles.planCell}`}>
          <span className={styles.cellCaption}>План</span>
          <output className={styles.plan} data-empty={plan === null || plan === 0 || undefined} aria-label={`План: ${item.name}`}>
            {plan ?? "—"}
          </output>
        </div>

        <label className={`${styles.cell} ${styles.factCell}`}>
          <span className={styles.cellCaption}>Факт</span>
          <input
            className={styles.input}
            inputMode="numeric"
            autoComplete="off"
            aria-label={`Факт: ${item.name}`}
            data-differs={differs || undefined}
            value={entry.fact}
            placeholder={plan !== null ? String(plan) : ""}
            disabled={locked || entry.rest === ""}
            onChange={(event) => onFact(digits(event.target.value))}
          />
        </label>

        {item.bunsPer ? (
          <div className={`${styles.cell} ${styles.bunsCell}`}>
            <span className={styles.cellCaption}>Булок</span>
            <span className={styles.buns}>{buns ?? "—"}</span>
          </div>
        ) : null}

        {!block ? (
          <button type="button" className={styles.lock} aria-label={`${category.lockAction}: ${item.name}`} title={category.lockAction} disabled={locking} onClick={onLock}>
            <LockOpenOutlinedIcon aria-hidden="true" />
          </button>
        ) : block.canUnlock ? (
          <button type="button" className={styles.lock} data-on aria-label={`Вернуть: ${item.name}`} title="Вернуть в работу" disabled={locking} onClick={onUnlock}>
            <LockOutlinedIcon aria-hidden="true" />
          </button>
        ) : (
          <span className={styles.lock} data-on data-hard title={block.text} aria-label={`Заблокировано: ${block.text}`} role="img">
            <LockOutlinedIcon aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
}
