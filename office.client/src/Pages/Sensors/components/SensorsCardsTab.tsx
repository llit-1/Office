import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import Button from "../../../Components/Button/Button";
import LoadingSpinner from "../../../Components/LoadingSpinner/LoadingSpinner";
import type { SensorRow } from "../sensors.types";
import styles from "../Sensors.module.css";
import dashboard from "../../../styles/entity-dashboard.module.css";

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
  onOpenRuleSettings: (sensor: SensorRow) => void;
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
  onOpenRuleSettings,
  onOpenChart,
}: SensorsCardsTabProps) {
  const onlineCount = sensors.filter((sensor) => sensor.actual !== 0).length;
  const offlineCount = sensors.filter((sensor) => sensor.actual === 0).length;

  return (
    <section className={`${styles.contentSection} ${dashboard.section}`}>
      <div className={styles.tableSection}>
        <div className={dashboard.toolbar}>
          <div className={dashboard.searchGroup}>
            <label className={dashboard.search}>
              <SearchRoundedIcon fontSize="small" />
              <input
                type="text"
                value={searchText}
                onChange={(event) => onSearchTextChange(event.target.value)}
                placeholder="Поиск по имени или IP"
              />
            </label>

            <Button variant="primary" onClick={onCreateSensor}>
              Добавить датчик
            </Button>
          </div>

          <div className={dashboard.filterGroup}>
            <button
              type="button"
              className={`${dashboard.filterButton} ${statusFilter === "all" ? dashboard.filterButtonActive : ""}`}
              onClick={() => onStatusFilterChange("all")}
            >
              Все
            </button>
            <button
              type="button"
              className={`${dashboard.filterButton} ${statusFilter === "online" ? dashboard.filterButtonActive : ""}`}
              onClick={() => onStatusFilterChange("online")}
            >
              Активные
            </button>
            <button
              type="button"
              className={`${dashboard.filterButton} ${statusFilter === "offline" ? dashboard.filterButtonActive : ""}`}
              onClick={() => onStatusFilterChange("offline")}
            >
              Неактивные
            </button>
          </div>
        </div>

        <div className={`${dashboard.metricsGrid} ${dashboard.metricsGridThree}`}>
          <article className={dashboard.metricCard}>
            <span className={dashboard.metricLabel}>Всего</span>
            <strong className={dashboard.metricValue}>{sensors.length}</strong>
          </article>

          <article className={dashboard.metricCard}>
            <span className={dashboard.metricLabel}>Активны</span>
            <strong className={dashboard.metricValue}>{onlineCount}</strong>
          </article>

          <article className={dashboard.metricCard}>
            <span className={dashboard.metricLabel}>Неактивны</span>
            <strong className={dashboard.metricValue}>{offlineCount}</strong>
          </article>
        </div>

        {sensorsLoading ? (
          <div className={styles.sensorsLoadingState}>
            <LoadingSpinner size={96} label="Загружаем датчики…" />
          </div>
        ) : filteredSensors.length === 0 ? (
          <div className={dashboard.emptyState}>По текущему фильтру датчики не найдены.</div>
        ) : (
          <div className={dashboard.cardsGrid}>
            {filteredSensors.map((sensor) => {
              const stateClassName =
                sensor.actual === 0
                  ? dashboard.cardInactive
                  : sensor.state === "OK"
                    ? dashboard.cardSuccess
                    : sensor.state === "Pending"
                      ? dashboard.cardWarning
                      : sensor.state === "Warning"
                        ? dashboard.cardDanger
                        : "";

              const dotClassName =
                sensor.actual === 0
                  ? dashboard.statusInactive
                  : sensor.state === "OK"
                    ? dashboard.statusSuccess
                    : sensor.state === "Pending"
                      ? dashboard.statusWarning
                      : sensor.state === "Warning"
                        ? dashboard.statusDanger
                        : "";

              const isGraphDisabled = sensor.actual === 0;

              return (
                <article
                  key={sensor.id}
                  className={`${dashboard.card} ${stateClassName}`}
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
                  <span className={`${dashboard.statusDot} ${dotClassName}`} aria-hidden="true" />

                  <div className={styles.sensorCardHeader}>
                    <h3 className={styles.sensorTitle} title={sensor.name}>
                      {sensor.name}
                    </h3>
                  </div>

                  <div className={styles.sensorMeta}>
                    <span className={styles.sensorIp} title={sensor.ip}>
                      {sensor.ip}
                    </span>

                    <div className={dashboard.cardActions}>
                      {!sensor.hasAlertSettings && (
                        <span
                          className={styles.missingDataBadge}
                          title="Правило для датчика не настроено"
                          aria-label="Правило для датчика не настроено"
                        >
                          !
                        </span>
                      )}

                      <button
                        type="button"
                        className={dashboard.cardActionButton}
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenRuleSettings(sensor);
                        }}
                        title="Открыть настройки правила"
                        aria-label="Открыть настройки правила"
                      >
                        <SettingsRoundedIcon fontSize="small" />
                      </button>

                      <button
                        type="button"
                        className={dashboard.cardActionButton}
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
