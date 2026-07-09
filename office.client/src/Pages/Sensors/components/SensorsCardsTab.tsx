import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import type { SensorRow } from "../sensors.types";
import styles from "../Sensors.module.css";

interface SensorsCardsTabProps {
  sensors: SensorRow[];
  filteredSensors: SensorRow[];
  sensorsLoading: boolean;
  searchText: string;
  statusFilter: "all" | "online" | "offline";
  onSearchTextChange: (value: string) => void;
  onStatusFilterChange: (value: "all" | "online" | "offline") => void;
  onCreateSensor: () => void;
  onEditSensor: (sensor: SensorRow) => void;
  onOpenChart: (sensor: SensorRow) => void;
}

export default function SensorsCardsTab({
  sensors,
  filteredSensors,
  sensorsLoading,
  searchText,
  statusFilter,
  onSearchTextChange,
  onStatusFilterChange,
  onCreateSensor,
  onEditSensor,
  onOpenChart,
}: SensorsCardsTabProps) {
  const onlineCount = sensors.filter((sensor) => sensor.actual !== 0).length;
  const offlineCount = sensors.filter((sensor) => sensor.actual === 0).length;

  return (
    <section className={styles.contentSection}>
      <div className={styles.tableSection}>
        <div className={styles.controlsBar}>
          <div className={styles.searchGroup}>
            <label className={styles.search}>
              <SearchRoundedIcon fontSize="small" />
              <input
                type="text"
                value={searchText}
                onChange={(event) => onSearchTextChange(event.target.value)}
                placeholder="Поиск по имени или IP"
              />
            </label>

            <button type="button" className={styles.addSensorButton} onClick={onCreateSensor}>
              Добавить датчик
            </button>
          </div>

          <div className={styles.filterBar}>
            <button
              type="button"
              className={`${styles.filterButton} ${statusFilter === "all" ? styles.filterButtonActive : ""}`}
              onClick={() => onStatusFilterChange("all")}
            >
              Все
            </button>
            <button
              type="button"
              className={`${styles.filterButton} ${statusFilter === "online" ? styles.filterButtonActive : ""}`}
              onClick={() => onStatusFilterChange("online")}
            >
              Активные
            </button>
            <button
              type="button"
              className={`${styles.filterButton} ${statusFilter === "offline" ? styles.filterButtonActive : ""}`}
              onClick={() => onStatusFilterChange("offline")}
            >
              Неактивные
            </button>
          </div>
        </div>

        <div className={styles.metricsGrid}>
          <article className={styles.metricCard}>
            <span>Всего</span>
            <strong>{sensors.length}</strong>
          </article>

          <article className={styles.metricCard}>
            <span>Активны</span>
            <strong>{onlineCount}</strong>
          </article>

          <article className={styles.metricCard}>
            <span>Неактивны</span>
            <strong>{offlineCount}</strong>
          </article>
        </div>

        {sensorsLoading ? (
          <div className={styles.emptyState}>Загружаем датчики...</div>
        ) : filteredSensors.length === 0 ? (
          <div className={styles.emptyState}>По текущему фильтру датчики не найдены.</div>
        ) : (
          <div className={styles.sensorsGrid}>
            {filteredSensors.map((sensor) => {
              const stateClassName =
                sensor.actual === 0
                  ? styles.sensorCardInactive
                  : sensor.state === "OK"
                    ? styles.sensorCardOnline
                    : sensor.state === "Pending"
                      ? styles.sensorCardPending
                      : sensor.state === "Warning"
                        ? styles.sensorCardOffline
                        : "";

              const dotClassName =
                sensor.actual === 0
                  ? styles.statusDotInactive
                  : sensor.state === "OK"
                    ? styles.statusDotOnline
                    : sensor.state === "Pending"
                      ? styles.statusDotPending
                      : sensor.state === "Warning"
                        ? styles.statusDotOffline
                        : "";

              const isGraphDisabled = sensor.actual === 0;

              return (
                <article
                  key={sensor.id}
                  className={`${styles.sensorCard} ${stateClassName}`}
                  onClick={() => onEditSensor(sensor)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onEditSensor(sensor);
                    }
                  }}
                >
                  <span className={`${styles.statusDot} ${dotClassName}`} aria-hidden="true" />

                  <div className={styles.sensorCardHeader}>
                    <h3 className={styles.sensorTitle} title={sensor.name}>
                      {sensor.name}
                    </h3>
                  </div>

                  <div className={styles.sensorMeta}>
                    <span className={styles.sensorIp} title={sensor.ip}>
                      {sensor.ip}
                    </span>

                    <div className={styles.sensorCardActions}>
                      {!sensor.hasAlertSettings && (
                        <span
                          className={styles.missingDataBadge}
                          title="Нет данных по замерам"
                          aria-label="Нет данных по замерам"
                        >
                          !
                        </span>
                      )}

                      <button
                        type="button"
                        className={`${styles.cardActionButton} ${isGraphDisabled ? styles.cardActionButtonDisabled : ""}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!isGraphDisabled) {
                            onOpenChart(sensor);
                          }
                        }}
                        title={isGraphDisabled ? "График недоступен для неактивного датчика" : "Открыть график температуры"}
                        aria-label={isGraphDisabled ? "График недоступен" : "Открыть график температуры"}
                        disabled={isGraphDisabled}
                      >
                        <ShowChartRoundedIcon fontSize="small" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
