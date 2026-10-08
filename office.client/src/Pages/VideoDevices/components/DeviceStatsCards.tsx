import type { DeviceStats } from "../videoDevices.types";
import dashboard from "../../../styles/entity-dashboard.module.css";
import Button from "../../../Components/Button/Button";
import RefreshIcon from "@mui/icons-material/Refresh";
import styles from "./DeviceStatsCards.module.css";

type DeviceStatsCardsProps = {
  stats: DeviceStats;
  onRetryErrors: () => void;
  retryingErrors: boolean;
  retryDisabled: boolean;
};

export default function DeviceStatsCards({
  stats,
  onRetryErrors,
  retryingErrors,
  retryDisabled,
}: DeviceStatsCardsProps) {
  return (
    <div className={`${dashboard.metricsGrid} ${dashboard.metricsGridFour}`}>
      <div className={dashboard.metricCard}>
        <span className={dashboard.metricLabel}>Всего</span>
        <strong className={dashboard.metricValue}>{stats.total}</strong>
      </div>
      <div className={dashboard.metricCard}>
        <span className={dashboard.metricLabel}>Онлайн</span>
        <strong className={dashboard.metricValue}>{stats.online}</strong>
      </div>
      <div className={`${dashboard.metricCard} ${styles.errorsCard}`}>
        <span className={dashboard.metricLabel}>Ошибки</span>
        <strong className={dashboard.metricValue}>{stats.errors}</strong>
        <Button
          className={styles.refreshButton}
          variant="ghost"
          aria-label="Повторно проверить устройства с ошибками"
          title="Повторно проверить жёлтые и красные карточки"
          onClick={onRetryErrors}
          disabled={retryDisabled}
          loading={retryingErrors}
        >
          <RefreshIcon />
        </Button>
      </div>
      <div className={dashboard.metricCard}>
        <span className={dashboard.metricLabel}>Требуют обновления</span>
        <strong className={dashboard.metricValue}>{stats.needUpdate}</strong>
      </div>
    </div>
  );
}
