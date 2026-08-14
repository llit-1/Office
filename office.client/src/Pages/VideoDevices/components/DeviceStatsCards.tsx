import type { DeviceStats } from "../videoDevices.types";
import dashboard from "../../../styles/entity-dashboard.module.css";

type DeviceStatsCardsProps = {
  stats: DeviceStats;
};

export default function DeviceStatsCards({ stats }: DeviceStatsCardsProps) {
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
      <div className={dashboard.metricCard}>
        <span className={dashboard.metricLabel}>Ошибки</span>
        <strong className={dashboard.metricValue}>{stats.errors}</strong>
      </div>
      <div className={dashboard.metricCard}>
        <span className={dashboard.metricLabel}>Требуют обновления</span>
        <strong className={dashboard.metricValue}>{stats.needUpdate}</strong>
      </div>
    </div>
  );
}
