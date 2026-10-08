import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";
import ShowChartRoundedIcon from "@mui/icons-material/ShowChartRounded";
import Button from "../../../Components/Button/Button";
import LoadingSpinner from "../../../Components/LoadingSpinner/LoadingSpinner";
import type { SensorRow, SensorStatus, SensorStatusFilter } from "../sensors.types";
import { getSensorStatus } from "../sensors.utils";
import styles from "../Sensors.module.css";
import dashboard from "../../../styles/entity-dashboard.module.css";

const statusMeta: Record<SensorStatus, { label: string; filterLabel: string; card: string; dot: string }> = {
  ok: { label: "В норме", filterLabel: "Норма", card: dashboard.cardSuccess, dot: dashboard.statusSuccess },
  pending: { label: "Отклонение", filterLabel: "Отклонение", card: dashboard.cardWarning, dot: dashboard.statusWarning },
  violation: { label: "Нарушение", filterLabel: "Нарушение", card: dashboard.cardDanger, dot: dashboard.statusDanger },
  inactive: { label: "Неактивны", filterLabel: "Неактивные", card: dashboard.cardInactive, dot: dashboard.statusInactive },
};

const statusList: SensorStatus[] = ["ok", "pending", "violation", "inactive"];

const statusTitles: Record<SensorStatus, string> = {
  ok: "Нарушений нет",
  pending: "Температура вне диапазона, уведомление ещё не отправлено",
  violation: "Идёт нарушение, уведомление отправлено",
  inactive: "Датчик неактивен",
};

interface SensorsCardsTabProps {
  sensors: SensorRow[];
  filteredSensors: SensorRow[];
  sensorsLoading: boolean;
  searchText: string;
  statusFilter: SensorStatusFilter;
  canManageDevices: boolean;
  onSearchTextChange: (value: string) => void;
  onStatusFilterChange: (value: SensorStatusFilter) => void;
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
  canManageDevices,
  onSearchTextChange,
  onStatusFilterChange,
  onCreateSensor,
  onEditSensor,
  onOpenRuleSettings,
  onOpenChart,
}: SensorsCardsTabProps) {
  const statusCounts = sensors.reduce<Record<SensorStatus, number>>(
    (counts, sensor) => {
      counts[getSensorStatus(sensor)] += 1;
      return counts;
    },
    { ok: 0, pending: 0, violation: 0, inactive: 0 },
  );

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

            {canManageDevices && (
              <Button variant="primary" onClick={onCreateSensor}>
                Добавить датчик
              </Button>
            )}
          </div>

          <div className={dashboard.filterGroup}>
            <button
              type="button"
              className={`${dashboard.filterButton} ${statusFilter === "all" ? dashboard.filterButtonActive : ""}`}
              onClick={() => onStatusFilterChange("all")}
            >
              Все
            </button>
            {statusList.map((status) => (
              <button
                key={status}
                type="button"
                className={`${dashboard.filterButton} ${statusFilter === status ? dashboard.filterButtonActive : ""}`}
                onClick={() => onStatusFilterChange(status)}
              >
                {statusMeta[status].filterLabel}
              </button>
            ))}
          </div>
        </div>

        <div className={`${dashboard.metricsGrid} ${styles.sensorMetricsGrid}`}>
          <article className={dashboard.metricCard}>
            <span className={dashboard.metricLabel}>Всего</span>
            <strong className={dashboard.metricValue}>{sensors.length}</strong>
          </article>

          {statusList.map((status) => (
            <article key={status} className={dashboard.metricCard} title={statusTitles[status]}>
              <span className={`${dashboard.metricLabel} ${styles.sensorMetricLabel}`}>
                <span className={`${styles.sensorMetricDot} ${statusMeta[status].dot}`} aria-hidden="true" />
                {statusMeta[status].label}
              </span>
              <strong className={dashboard.metricValue}>{statusCounts[status]}</strong>
            </article>
          ))}
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
              const status = getSensorStatus(sensor);

              const isGraphDisabled = status === "inactive";

              return (
                <article
                  key={sensor.id}
                  className={`${dashboard.card} ${statusMeta[status].card}`}
                  title={statusTitles[status]}
                  onClick={() => {
                    if (canManageDevices) {
                      onEditSensor(sensor);
                    }
                  }}
                  role={canManageDevices ? "button" : undefined}
                  tabIndex={canManageDevices ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (canManageDevices && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      onEditSensor(sensor);
                    }
                  }}
                >
                  <span className={`${dashboard.statusDot} ${statusMeta[status].dot}`} aria-hidden="true" />

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
