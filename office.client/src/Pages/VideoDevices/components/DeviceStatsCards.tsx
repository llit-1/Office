import type { DeviceStats, StatusFilter } from "../videoDevices.types";
import dashboard from "../../../styles/entity-dashboard.module.css";
import Button from "../../../Components/Button/Button";
import RefreshIcon from "@mui/icons-material/Refresh";
import styles from "./DeviceStatsCards.module.css";

type DeviceStatsCardsProps = {
  stats: DeviceStats;
  status: StatusFilter;
  onStatusChange: (status: StatusFilter) => void;
  onRetryErrors: () => void;
  retryingErrors: boolean;
  retryDisabled: boolean;
};

type Tile = {
  status: StatusFilter;
  label: string;
  value: (stats: DeviceStats) => number;
  hint: string;
  tone?: (stats: DeviceStats) => string;
};

const tiles: Tile[] = [
  { status: "all", label: "Всего", value: (s) => s.total, hint: "Показать все приставки" },
  {
    status: "working",
    label: "Работают",
    value: (s) => s.working,
    hint: "Показывают контент (по сигналу приставки) или отвечают на проверку",
  },
  {
    status: "noSignal",
    label: "Нет связи",
    value: (s) => s.noSignal,
    hint: "Связь пропала меньше суток назад, до этого всё было в порядке — скорее всего, пропал интернет на точке",
    tone: () => styles.mutedValue,
  },
  {
    status: "attention",
    label: "Требуют внимания",
    value: (s) => s.attention,
    hint: "Есть проблема, или связь пропала, когда уже была проблема, или связи нет больше суток",
    tone: (s) => (s.attention > 0 ? styles.warningTile : ""),
  },
  {
    status: "urgent",
    label: "Срочные",
    value: (s) => s.urgent,
    hint: "Точка, скорее всего, ничего не показывает или не играет — нужно разбираться сейчас",
    tone: (s) => (s.urgent > 0 ? styles.attentionCard : ""),
  },
  {
    status: "outdated",
    label: "Требуют обновления",
    value: (s) => s.needUpdate,
    hint: "Приложение старее версии на сервере",
  },
];

export default function DeviceStatsCards({
  stats,
  status,
  onStatusChange,
  onRetryErrors,
  retryingErrors,
  retryDisabled,
}: DeviceStatsCardsProps) {
  return (
    <div className={`${dashboard.metricsGrid} ${styles.metricsGridSix}`} role="group" aria-label="Фильтр по состоянию">
      {tiles.map((tile) => {
        const active = status === tile.status;
        return (
          <div key={tile.status} className={styles.tileWrap}>
            <button
              type="button"
              className={`${dashboard.metricCard} ${styles.tile} ${tile.tone?.(stats) ?? ""} ${active ? styles.tileActive : ""}`}
              aria-pressed={active}
              title={`${tile.hint}${tile.status !== "all" ? (active ? ". Нажмите ещё раз, чтобы показать все" : ". Нажмите, чтобы показать только их") : ""}`}
              // Повторное нажатие на выбранную плитку возвращает весь список
              onClick={() => onStatusChange(active ? "all" : tile.status)}
            >
              <span className={dashboard.metricLabel}>{tile.label}</span>
              <strong className={dashboard.metricValue}>{tile.value(stats)}</strong>
            </button>
            {tile.status === "attention" && (
              <Button
                className={styles.refreshButton}
                variant="ghost"
                aria-label="Повторно проверить приставки со старым приложением, которые не ответили"
                title="Повторно проверить приставки, которые не ответили на проверку"
                onClick={onRetryErrors}
                disabled={retryDisabled}
                loading={retryingErrors}
              >
                <RefreshIcon />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
