import { useState, type ReactNode } from "react";
import DataObjectRoundedIcon from "@mui/icons-material/DataObjectRounded";
import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import LoadingSpinner from "../../../Components/LoadingSpinner/LoadingSpinner";
import type { YandexResponse } from "../deliveryRequests.types";
import styles from "../DeliveryRequests.module.css";

type RequestPanelProps = {
  id: string;
  title: string;
  /** Количество записей рядом с заголовком; не показываем, пока ответа нет. */
  count?: number | null;
  /** Элементы справа в заголовке: фильтры, поиск, кнопки. */
  actions?: ReactNode;
  loading: boolean;
  error: string;
  /** Сырой ответ сервиса — по кнопке { } его можно посмотреть целиком. */
  response: YandexResponse;
  onRefresh?: () => void;
  children: ReactNode;
};

/** Панель с результатом запроса к Яндексу: заголовок с действиями, ошибка, загрузка и исходный ответ. */
export default function RequestPanel({ id, title, count, actions, loading, error, response, onRefresh, children }: RequestPanelProps) {
  const [rawVisible, setRawVisible] = useState(false);
  const hasResponse = response !== null && response !== undefined;

  return (
    <section className={styles.panel} aria-labelledby={id}>
      <header className={styles.panelHeader}>
        <h2 id={id} className={styles.panelTitle}>
          {title}
          {typeof count === "number" ? <span className={styles.panelCount}>{count}</span> : null}
        </h2>
        <div className={styles.panelActions}>
          {actions}
          {onRefresh ? (
            <button
              type="button"
              className={styles.iconButton}
              onClick={onRefresh}
              disabled={loading}
              title="Обновить"
              aria-label={`Обновить: ${title.toLowerCase()}`}
            >
              <RefreshRoundedIcon fontSize="small" />
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.iconButton} ${rawVisible ? styles.iconButtonActive : ""}`}
            onClick={() => setRawVisible((visible) => !visible)}
            disabled={!hasResponse}
            aria-pressed={rawVisible}
            title={rawVisible ? "Скрыть ответ сервиса" : "Показать ответ сервиса"}
            aria-label={rawVisible ? "Скрыть ответ сервиса" : "Показать ответ сервиса"}
          >
            <DataObjectRoundedIcon fontSize="small" />
          </button>
        </div>
      </header>

      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.panelBody} aria-busy={loading || undefined}>
        {children}
        {loading ? (
          <div className={styles.panelLoading}>
            <LoadingSpinner size={40} label="Загружаем…" />
          </div>
        ) : null}
      </div>

      {rawVisible && hasResponse ? <pre className={styles.raw}>{JSON.stringify(response, null, 2)}</pre> : null}
    </section>
  );
}
