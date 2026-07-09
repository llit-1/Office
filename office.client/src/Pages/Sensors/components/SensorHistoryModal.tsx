import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { LineChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, MarkAreaComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import Modal from "../../../Components/Modal/Modal";
import type { MaintenanceWindowItem, NormalizedHistoryPoint, SensorRow, SensorRuleSettings } from "../sensors.types";
import { formatAxisDate, formatHumidityLabel, formatShortAxisDate, formatTemperatureLabel, periodOptions } from "../sensors.utils";
import styles from "../Sensors.module.css";

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, MarkAreaComponent, CanvasRenderer]);

interface SensorHistoryModalProps {
  sensor: SensorRow | null;
  sensorSettings: SensorRuleSettings | null;
  maintenanceWindows: MaintenanceWindowItem[];
  historyLoading: boolean;
  normalizedHistory: NormalizedHistoryPoint[];
  historyPeriodHours: (typeof periodOptions)[number]["hours"];
  onPeriodChange: (hours: (typeof periodOptions)[number]["hours"]) => void;
  onClose: () => void;
}

function parseTimeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.slice(0, 5).split(":");
  return Number(hours) * 60 + Number(minutes);
}

function getDayMask(date: Date) {
  const jsDay = date.getDay();
  return jsDay === 0 ? 64 : 1 << (jsDay - 1);
}

function normalizeDateOnly(value: string) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function isPointInMaintenanceWindow(pointDate: string, maintenanceWindows: MaintenanceWindowItem[]) {
  if (maintenanceWindows.length === 0) {
    return false;
  }

  const date = new Date(pointDate);
  const dayMask = getDayMask(date);
  const minutesOfDay = date.getHours() * 60 + date.getMinutes();
  const currentDateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  return maintenanceWindows.some((window) => {
    if (!window.isEnabled) {
      return false;
    }

    const startMinutes = parseTimeToMinutes(window.startTime);
    const endMinutes = parseTimeToMinutes(window.endTime);
    const isOvernight = endMinutes < startMinutes;
    const timeMatches = isOvernight
      ? minutesOfDay >= startMinutes || minutesOfDay <= endMinutes
      : minutesOfDay >= startMinutes && minutesOfDay <= endMinutes;

    if (!timeMatches) {
      return false;
    }

    if (window.scheduleType === "daily") {
      return true;
    }

    if (window.scheduleType === "weekly") {
      return Boolean((window.daysOfWeekMask ?? 0) & dayMask);
    }

    if (window.scheduleType === "one_time") {
      if (!window.startDate || !window.endDate) {
        return false;
      }

      const startDateOnly = normalizeDateOnly(window.startDate);
      const endDateOnly = normalizeDateOnly(window.endDate);
      return currentDateOnly >= startDateOnly && currentDateOnly <= endDateOnly;
    }

    return false;
  });
}

export default function SensorHistoryModal({
  sensor,
  sensorSettings,
  maintenanceWindows,
  historyLoading,
  normalizedHistory,
  historyPeriodHours,
  onPeriodChange,
  onClose,
}: SensorHistoryModalProps) {
  const historyStats = useMemo(() => {
    if (normalizedHistory.length === 0) {
      return null;
    }

    const minPoint = normalizedHistory.reduce(
      (lowest, point) => (point.temperature < lowest.temperature ? point : lowest),
      normalizedHistory[0],
    );
    const maxPoint = normalizedHistory.reduce(
      (highest, point) => (point.temperature > highest.temperature ? point : highest),
      normalizedHistory[0],
    );

    return { minPoint, maxPoint };
  }, [normalizedHistory]);

  const chartOption = useMemo<EChartsOption | null>(() => {
    if (normalizedHistory.length === 0) {
      return null;
    }

    const minRule = sensorSettings?.isEnabled ? sensorSettings.minTemperature : null;
    const maxRule = sensorSettings?.isEnabled ? sensorSettings.maxTemperature : null;
    const maintenanceFlags = normalizedHistory.map((point) => isPointInMaintenanceWindow(point.date, maintenanceWindows));

    const maintenanceMarkAreas: Array<[{ xAxis: string }, { xAxis: string }]> = [];
    for (let index = 0; index < normalizedHistory.length; index += 1) {
      if (!maintenanceFlags[index]) {
        continue;
      }

      const startDate = normalizedHistory[index].date;

      while (index + 1 < normalizedHistory.length && maintenanceFlags[index + 1]) {
        index += 1;
      }
      const endBoundary = normalizedHistory[Math.min(index + 1, normalizedHistory.length - 1)].date;

      maintenanceMarkAreas.push([{ xAxis: startDate }, { xAxis: endBoundary }]);
    }

    const dangerSeriesData =
      minRule == null && maxRule == null
        ? []
        : normalizedHistory.map((point, index) => {
            const isOutOfRange =
              (minRule != null && point.temperature < minRule) || (maxRule != null && point.temperature > maxRule);

            return isOutOfRange && !maintenanceFlags[index] ? point.temperature : null;
          });

    const minThresholdSeriesData =
      minRule == null ? [] : normalizedHistory.map((_, index) => (maintenanceFlags[index] ? null : minRule));

    const maxThresholdSeriesData =
      maxRule == null ? [] : normalizedHistory.map((_, index) => (maintenanceFlags[index] ? null : maxRule));

    return {
      animation: true,
      animationDuration: 250,
      animationDurationUpdate: 0,
      grid: {
        left: 56,
        right: 18,
        top: 18,
        bottom: 54,
      },
      tooltip: {
        trigger: "axis",
        axisPointer: {
          type: "cross",
          snap: true,
          label: {
            backgroundColor: "#1f2937",
            formatter: (params) => {
              if (params.axisDimension === "x") {
                return formatAxisDate(String(params.value));
              }

              return formatTemperatureLabel(Number(params.value));
            },
          },
        },
        backgroundColor: "rgba(15, 23, 42, 0.95)",
        borderWidth: 0,
        textStyle: {
          color: "#f8fafc",
          fontSize: 12,
        },
        padding: 12,
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          if (items.length === 0) {
            return "";
          }

          const point = normalizedHistory[items[0].dataIndex];
          const rows = [
            `<div style="margin-bottom:8px;font-weight:700;">${formatAxisDate(point.date)}</div>`,
            `<div>Температура: <b>${formatTemperatureLabel(point.temperature)}C</b></div>`,
          ];

          if (point.humidity !== null) {
            rows.push(`<div>Влажность: <b>${formatHumidityLabel(point.humidity)}</b></div>`);
          }

          return rows.join("");
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: normalizedHistory.map((point) => point.date),
        axisLabel: {
          color: "#6b7280",
          formatter: (value: string) => formatShortAxisDate(value),
        },
        axisLine: {
          lineStyle: {
            color: "#d1d5db",
          },
        },
        axisTick: {
          show: false,
        },
      },
      yAxis: {
        type: "value",
        scale: true,
        axisLabel: {
          color: "#6b7280",
          formatter: (value: number) => formatTemperatureLabel(value),
        },
        splitLine: {
          lineStyle: {
            color: "rgba(148, 163, 184, 0.2)",
          },
        },
      },
      dataZoom: [
        {
          type: "inside",
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
        },
      ],
      series: [
        {
          name: "temperature",
          type: "line",
          smooth: 0.14,
          connectNulls: false,
          showSymbol: false,
          symbol: "circle",
          symbolSize: 5,
          sampling: historyPeriodHours >= 168 ? "lttb" : undefined,
          lineStyle: {
            width: 3,
            color: "#f97316",
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: "rgba(249, 115, 22, 0.20)" },
                { offset: 1, color: "rgba(249, 115, 22, 0.02)" },
              ],
            },
          },
          markPoint: historyStats
            ? {
                symbol: "circle",
                symbolSize: 10,
                itemStyle: {
                  color: "#ffffff",
                  borderWidth: 3,
                },
                label: {
                  show: false,
                },
                data: [
                  {
                    name: "minimum",
                    coord: [historyStats.minPoint.date, historyStats.minPoint.temperature],
                    value: historyStats.minPoint.temperature,
                    itemStyle: { borderColor: "#f59e0b" },
                  },
                  {
                    name: "maximum",
                    coord: [historyStats.maxPoint.date, historyStats.maxPoint.temperature],
                    value: historyStats.maxPoint.temperature,
                    itemStyle: { borderColor: "#ef4444" },
                  },
                ],
              }
            : undefined,
          emphasis: {
            disabled: true,
          },
          data: normalizedHistory.map((point) => point.temperature),
        },
        ...(dangerSeriesData.length > 0
          ? [
              {
                name: "danger-outside-maintenance",
                type: "line" as const,
                smooth: 0.14,
                connectNulls: false,
                showSymbol: false,
                z: 4,
                lineStyle: {
                  width: 3,
                  color: "#dc2626",
                },
                data: dangerSeriesData,
              },
            ]
          : []),
        ...(minThresholdSeriesData.length > 0
          ? [
              {
                name: "min-threshold",
                type: "line" as const,
                data: minThresholdSeriesData,
                showSymbol: false,
                connectNulls: false,
                silent: true,
                z: 2,
                lineStyle: {
                  width: 1.5,
                  type: "dashed" as const,
                  color: "#ef4444",
                },
              },
            ]
          : []),
        ...(maxThresholdSeriesData.length > 0
          ? [
              {
                name: "max-threshold",
                type: "line" as const,
                data: maxThresholdSeriesData,
                showSymbol: false,
                connectNulls: false,
                silent: true,
                z: 2,
                lineStyle: {
                  width: 1.5,
                  type: "dashed" as const,
                  color: "#ef4444",
                },
              },
            ]
          : []),
        ...(maintenanceMarkAreas.length > 0
          ? [
              {
                name: "maintenance",
                type: "line" as const,
                animation: false,
                data: normalizedHistory.map(() => null),
                silent: true,
                tooltip: {
                  show: false,
                },
                emphasis: {
                  disabled: true,
                },
                showSymbol: false,
                lineStyle: {
                  opacity: 0,
                },
                z: 1,
                markArea: {
                  silent: true,
                  label: {
                    show: false,
                  },
                  itemStyle: {
                    color: "rgba(59, 130, 246, 0.18)",
                  },
                  data: maintenanceMarkAreas as never,
                },
              },
            ]
          : []),
      ],
    };
  }, [historyPeriodHours, historyStats, maintenanceWindows, normalizedHistory, sensorSettings]);

  return (
    <Modal
      isOpen={sensor !== null}
      onClose={onClose}
      title={sensor ? `Температура: ${sensor.name}` : "Температура"}
      size="lg"
      panelClassName={styles.chartModalPanel}
    >
      {sensor && (
        <>
          <div className={styles.chartToolbar}>
            <div className={styles.chartMeta}>
              <span>{sensor.ip}</span>
              <span>Точек: {normalizedHistory.length}</span>
            </div>

            <div className={styles.periodButtons}>
              {periodOptions.map((option) => (
                <button
                  key={option.hours}
                  type="button"
                  className={`${styles.periodButton} ${historyPeriodHours === option.hours ? styles.periodButtonActive : ""}`}
                  onClick={() => onPeriodChange(option.hours)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {historyStats && (
            <div className={styles.chartStats}>
              <article className={styles.chartStatCard}>
                <span className={styles.chartStatLabel}>Минимум</span>
                <strong className={styles.chartStatValue}>{formatTemperatureLabel(historyStats.minPoint.temperature)}</strong>
                <span className={styles.chartStatTime}>{formatAxisDate(historyStats.minPoint.date)}</span>
              </article>

              <article className={styles.chartStatCard}>
                <span className={styles.chartStatLabel}>Максимум</span>
                <strong className={styles.chartStatValue}>{formatTemperatureLabel(historyStats.maxPoint.temperature)}</strong>
                <span className={styles.chartStatTime}>{formatAxisDate(historyStats.maxPoint.date)}</span>
              </article>
            </div>
          )}

          {historyLoading ? (
            <div className={styles.chartEmpty}>Загружаем график...</div>
          ) : chartOption ? (
            <div className={styles.chartWrap}>
              <ReactEChartsCore echarts={echarts} option={chartOption} notMerge lazyUpdate className={styles.chartCanvas} />
            </div>
          ) : (
            <div className={styles.chartEmpty}>За выбранный период нет данных.</div>
          )}
        </>
      )}
    </Modal>
  );
}
