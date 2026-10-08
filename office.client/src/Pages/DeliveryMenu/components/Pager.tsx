import ChevronLeftRoundedIcon from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRoundedIcon from "@mui/icons-material/ChevronRightRounded";
import styles from "../DeliveryRequests.module.css";

type PagerProps = {
  offset: number;
  pageSize: number;
  /** Сколько записей пришло на текущей странице. */
  count: number;
  disabled: boolean;
  onChange: (offset: number) => void;
};

/**
 * Компактное листание «1–100 ‹ ›». Общего количества Яндекс не отдаёт,
 * поэтому следующая страница доступна, пока текущая заполнена целиком.
 */
export default function Pager({ offset, pageSize, count, disabled, onChange }: PagerProps) {
  if (offset === 0 && count < pageSize) return null;

  return (
    <div className={styles.pager}>
      <span>{count === 0 ? "Нет записей" : `${offset + 1}–${offset + count}`}</span>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => onChange(Math.max(0, offset - pageSize))}
        disabled={disabled || offset === 0}
        aria-label="Предыдущая страница"
      >
        <ChevronLeftRoundedIcon fontSize="small" />
      </button>
      <button
        type="button"
        className={styles.iconButton}
        onClick={() => onChange(offset + pageSize)}
        disabled={disabled || count < pageSize}
        aria-label="Следующая страница"
      >
        <ChevronRightRoundedIcon fontSize="small" />
      </button>
    </div>
  );
}
