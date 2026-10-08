import type { BulkResult } from "../bulkRun";
import type { RequestLocation } from "../deliveryRequests.types";
import styles from "../DeliveryRequests.module.css";

type BulkProgressProps = {
  total: number;
  results: BulkResult<unknown>[];
  locations: RequestLocation[];
  running: boolean;
  successText: string;
};

/** Ход массового действия: прогресс, итог и список точек, по которым Яндекс ответил ошибкой. */
export default function BulkProgress({ total, results, locations, running, successText }: BulkProgressProps) {
  const failed = results.filter((result): result is Extract<BulkResult<unknown>, { ok: false }> => !result.ok);
  const succeeded = results.length - failed.length;
  const nameOf = (guid: string) => locations.find((location) => location.guid === guid)?.name ?? guid;
  const percent = total === 0 ? 0 : Math.round((results.length / total) * 100);

  return (
    <div className={styles.bulk} aria-live="polite">
      <div className={styles.bulkHeader}>
        <span>{running ? `Выполняется: ${results.length} из ${total}` : "Готово"}</span>
        <span className={styles.bulkCounts}>
          <span className={styles.bulkOk}>{successText}: {succeeded}</span>
          {failed.length > 0 ? <span className={styles.bulkFail}>Ошибок: {failed.length}</span> : null}
        </span>
      </div>
      <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={results.length}>
        <span style={{ width: `${percent}%` }} />
      </div>
      {failed.length > 0 ? (
        <ul className={styles.bulkErrors}>
          {failed.map((result) => (
            <li key={result.guid}>
              <strong>{nameOf(result.guid)}</strong>
              <span>{result.error}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
