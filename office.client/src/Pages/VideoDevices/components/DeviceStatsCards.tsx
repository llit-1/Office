import type { DeviceStats } from "../videoDevices.types";
import styles from "../VideoDevices.module.css";

type DeviceStatsCardsProps = {
  stats: DeviceStats;
};

export default function DeviceStatsCards({ stats }: DeviceStatsCardsProps) {
  return (
    <div className={styles.statsGrid}>
      <div className={`${styles.statsCard} ${styles.statsCardTotal}`}>
        <span className={styles.statsValue}>{stats.total}</span>
        <span className={styles.statsLabel}>устройств</span>
      </div>
      <div className={`${styles.statsCard} ${styles.statsCardOnline}`}>
        <span className={styles.statsValue}>{stats.online}</span>
        <span className={styles.statsLabel}>онлайн</span>
      </div>
      <div className={`${styles.statsCard} ${styles.statsCardErrors}`}>
        <span className={styles.statsValue}>{stats.errors}</span>
        <span className={styles.statsLabel}>ошибки</span>
      </div>
      <div className={`${styles.statsCard} ${styles.statsCardUpdates}`}>
        <span className={styles.statsValue}>{stats.needUpdate}</span>
        <span className={styles.statsLabel}>требуют обновления</span>
      </div>
    </div>
  );
}
