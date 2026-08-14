import { useMemo } from "react";
import OpenInFullRoundedIcon from "@mui/icons-material/OpenInFullRounded";
import CloseFullscreenRoundedIcon from "@mui/icons-material/CloseFullscreenRounded";
import type { EChartsOption } from "echarts";
import { LineChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, MarkAreaComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { useDispatch, useSelector } from "react-redux";
import Modal from "../../../Components/Modal/Modal";
import type { MaintenanceWindowItem, NormalizedHistoryPoint, SensorRow, SensorRuleSettings } from "../sensors.types";
import { formatAxisDate, formatShortAxisDate, formatTemperatureLabel, periodOptions } from "../sensors.utils";
import styles from "../Sensors.module.css";
import type { RootState } from "../../../Store";
import { setSensorChartExpanded, setSensorChartLineWidth } from "../../../Store/preferencesSlice";

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

type ChartStat = {
  label: string;
  value: string;
  meta?: string;
};

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

function formatDuration(totalMinutes: number) {
  if (totalMinutes <= 0) {
    return "0 мин";
  }

  const rounded = Math.round(totalMinutes);
  const days = Math.floor(rounded / (24 * 60));
  const hours = Math.floor((rounded % (24 * 60)) / 60);
  const minutes = rounded % 60;
  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} д`);
  }
  if (hours > 0) {
    parts.push(`${hours} ч`);
  }
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} мин`);
  }

  return parts.join(" ");
}

function getOutOfRangeStatus(point: NormalizedHistoryPoint, sensorSettings: SensorRuleSettings | null, inMaintenance: boolean) {
  if (!sensorSettings?.isEnabled || inMaintenance) {
    return false;
  }

  const minRule = sensorSettings.minTemperature;
  const maxRule = sensorSettings.maxTemperature;
  return (minRule != null && point.temperature < minRule) || (maxRule != null && point.temperature > maxRule);
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
  const dispatch = useDispatch();
  const chartExpanded = useSelector((state: RootState) => state.preferences.sensorChartExpanded);
  const chartLineWidth = useSelector((state: RootState) => state.preferences.sensorChartLineWidth);
  const lineWidthOptions = [1, 1.5, 2, 3];
  const currentLineWidthIndex = lineWidthOptions.findIndex((width) => width === chartLineWidth);

  const chartColors = useMemo(() => {
    const rootStyles = getComputedStyle(document.documentElement);
    const token = (name: string) => rootStyles.getPropertyValue(name).trim();

    return {
      tooltipLabel: token("--color-chart-tooltip-label"),
      tooltipBackground: token("--color-chart-tooltip-bg"),
      tooltipText: token("--color-chart-tooltip-text"),
      axis: token("--color-chart-axis"),
      axisLine: token("--color-chart-axis-line"),
      grid: token("--color-chart-grid"),
      series: token("--color-chart-series"),
      seriesFill: token("--color-chart-series-fill"),
      seriesFillSoft: token("--color-chart-series-fill-soft"),
      point: token("--color-chart-point"),
      warning: token("--color-chart-warning"),
      danger: token("--color-chart-danger"),
      maintenance: token("--color-chart-maintenance"),
    };
  }, []);

  const handleLineWidthStep = (direction: -1 | 1) => {
    const nextIndex = currentLineWidthIndex + direction;
    if (nextIndex < 0 || nextIndex >= lineWidthOptions.length) {
      return;
    }

    dispatch(setSensorChartLineWidth(lineWidthOptions[nextIndex]));
  };

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

    const currentPoint = normalizedHistory[normalizedHistory.length - 1];
    const averageTemperature =
      normalizedHistory.reduce((sum, point) => sum + point.temperature, 0) / normalizedHistory.length;

    const maintenanceFlags = normalizedHistory.map((point) => isPointInMaintenanceWindow(point.date, maintenanceWindows));
    const violationFlags = normalizedHistory.map((point, index) =>
      getOutOfRangeStatus(point, sensorSettings, maintenanceFlags[index]),
    );

    let outOfRangeMinutes = 0;
    let maintenanceMinutes = 0;

    for (let index = 0; index < normalizedHistory.length; index += 1) {
      if (index === normalizedHistory.length - 1) {
        continue;
      }

      const currentDate = new Date(normalizedHistory[index].date).getTime();
      const nextDate = new Date(normalizedHistory[index + 1].date).getTime();
      const intervalMinutes = Math.max((nextDate - currentDate) / 60000, 0);

      if (violationFlags[index]) {
        outOfRangeMinutes += intervalMinutes;
      }

      if (maintenanceFlags[index]) {
        maintenanceMinutes += intervalMinutes;
      }
    }

    const firstDate = new Date(normalizedHistory[0].date).getTime();
    const lastDate = new Date(currentPoint.date).getTime();
    const totalDurationMinutes = Math.max((lastDate - firstDate) / 60000, 0);
    const outOfRangePercent = totalDurationMinutes > 0 ? (outOfRangeMinutes / totalDurationMinutes) * 100 : 0;
    const maintenancePercent = totalDurationMinutes > 0 ? (maintenanceMinutes / totalDurationMinutes) * 100 : 0;

    const cards: ChartStat[] = [
      {
        label: "Текущая температура",
        value: formatTemperatureLabel(currentPoint.temperature),
        meta: formatAxisDate(currentPoint.date),
      },
      {
        label: "Минимум",
        value: formatTemperatureLabel(minPoint.temperature),
        meta: formatAxisDate(minPoint.date),
      },
      {
        label: "Максимум",
        value: formatTemperatureLabel(maxPoint.temperature),
        meta: formatAxisDate(maxPoint.date),
      },
      {
        label: "Среднее",
        value: formatTemperatureLabel(averageTemperature),
      },
      {
        label: "Вне нормы",
        value: formatDuration(outOfRangeMinutes),
        meta: `${outOfRangePercent.toFixed(1)}% периода`,
      },
      {
        label: "Техработы",
        value: formatDuration(maintenanceMinutes),
        meta: `${maintenancePercent.toFixed(1)}% периода`,
      },
    ];

    return {
      minPoint,
      maxPoint,
      cards,
      maintenanceFlags,
      violationFlags,
    };
  }, [maintenanceWindows, normalizedHistory, sensorSettings]);

  const chartOption = useMemo<EChartsOption | null>(() => {
    if (normalizedHistory.length === 0 || historyStats == null) {
      return null;
    }

    const minRule = sensorSettings?.isEnabled ? sensorSettings.minTemperature : null;
    const maxRule = sensorSettings?.isEnabled ? sensorSettings.maxTemperature : null;
    const maintenanceFlags = historyStats.maintenanceFlags;

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
        : normalizedHistory.map((point, index) => (historyStats.violationFlags[index] ? point.temperature : null));

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
        confine: true,
        axisPointer: {
          type: "cross",
          snap: true,
          label: {
            backgroundColor: chartColors.tooltipLabel,
            formatter: (params) => {
              if (params.axisDimension === "x") {
                return formatAxisDate(String(params.value));
              }

              return formatTemperatureLabel(Number(params.value));
            },
          },
        },
        backgroundColor: chartColors.tooltipBackground,
        borderWidth: 0,
        textStyle: {
          color: chartColors.tooltipText,
          fontSize: 12,
        },
        padding: 12,
        formatter: (params) => {
          const items = Array.isArray(params) ? params : [params];
          if (items.length === 0) {
            return "";
          }

          const point = normalizedHistory[items[0].dataIndex];
          return [
            `<div style="margin-bottom:8px;font-weight:700;">${formatAxisDate(point.date)}</div>`,
            `<div>Температура: <b>${formatTemperatureLabel(point.temperature)}C</b></div>`,
          ].join("");
        },
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: normalizedHistory.map((point) => point.date),
        axisLabel: {
          color: chartColors.axis,
          formatter: (value: string) => formatShortAxisDate(value),
        },
        axisLine: {
          lineStyle: {
            color: chartColors.axisLine,
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
          color: chartColors.axis,
          formatter: (value: number) => formatTemperatureLabel(value),
        },
        splitLine: {
          lineStyle: {
            color: chartColors.grid,
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
            width: chartLineWidth,
            color: chartColors.series,
          },
          areaStyle: {
            color: {
              type: "linear",
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: chartColors.seriesFill },
                { offset: 1, color: chartColors.seriesFillSoft },
              ],
            },
          },
          markPoint: {
            symbol: "circle",
            symbolSize: 10,
            itemStyle: {
              color: chartColors.point,
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
                itemStyle: { borderColor: chartColors.warning },
              },
              {
                name: "maximum",
                coord: [historyStats.maxPoint.date, historyStats.maxPoint.temperature],
                value: historyStats.maxPoint.temperature,
                itemStyle: { borderColor: chartColors.danger },
              },
            ],
          },
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
                  width: chartLineWidth,
                  color: chartColors.danger,
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
                  color: chartColors.danger,
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
                  color: chartColors.danger,
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
                    color: chartColors.maintenance,
                  },
                  data: maintenanceMarkAreas as never,
                },
              },
            ]
          : []),
      ],
      media: [
        {
          query: {
            maxWidth: 520,
          },
          option: {
            grid: {
              left: 44,
              right: 10,
              top: 12,
              bottom: 42,
            },
            tooltip: {
              padding: 8,
              textStyle: {
                color: chartColors.tooltipText,
                fontSize: 12,
              },
            },
            xAxis: {
              axisLabel: {
                fontSize: 12,
                hideOverlap: true,
              },
            },
            yAxis: {
              axisLabel: {
                fontSize: 12,
              },
            },
          },
        },
      ],
    };
  }, [chartColors, chartLineWidth, historyPeriodHours, historyStats, normalizedHistory, sensorSettings]);

  return (
    <Modal
      isOpen={sensor !== null}
      onClose={onClose}
      title={sensor ? `Температура: ${sensor.name}` : "Температура"}
      size="lg"
      panelClassName={`${styles.chartModalPanel} ${chartExpanded ? styles.chartModalPanelExpanded : ""}`}
      headerClassName={styles.chartModalHeader}
      titleClassName={styles.chartModalTitle}
      bodyClassName={`${styles.chartModalBody} ${chartExpanded ? styles.chartModalBodyExpanded : ""}`}
      headerActions={
        <button
          type="button"
          className={styles.chartHeaderButton}
          onClick={() => dispatch(setSensorChartExpanded(!chartExpanded))}
          aria-label={chartExpanded ? "Уменьшить окно" : "Расширить окно"}
          title={chartExpanded ? "Уменьшить окно" : "Расширить окно"}
        >
          {chartExpanded ? <CloseFullscreenRoundedIcon fontSize="small" /> : <OpenInFullRoundedIcon fontSize="small" />}
        </button>
      }
    >
      {sensor && (
        <div className={`${styles.chartContent} ${chartExpanded ? styles.chartContentExpanded : ""}`}>
          <div className={styles.chartToolbar}>
            <div className={styles.chartMeta}>
              <span>{sensor.ip}</span>
              <span>Точек: {normalizedHistory.length}</span>
            </div>

            <div className={styles.chartControls}>
              <div className={styles.lineWidthControls}>
                <span className={styles.lineWidthLabel}>Линия</span>
                <button
                  type="button"
                  className={styles.lineWidthStepButton}
                  onClick={() => handleLineWidthStep(-1)}
                  title="Уменьшить толщину линии"
                  aria-label="Уменьшить толщину линии"
                  disabled={currentLineWidthIndex <= 0}
                >
                  <span className={styles.lineWidthGlyph} aria-hidden="true">
                    <span className={`${styles.lineWidthPreview} ${styles.lineWidthPreviewThin}`} />
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.lineWidthStepButton}
                  onClick={() => handleLineWidthStep(1)}
                  title="Увеличить толщину линии"
                  aria-label="Увеличить толщину линии"
                  disabled={currentLineWidthIndex >= lineWidthOptions.length - 1}
                >
                  <span className={styles.lineWidthGlyph} aria-hidden="true">
                    <span className={`${styles.lineWidthPreview} ${styles.lineWidthPreviewThick}`} />
                  </span>
                </button>
                {false ? lineWidthOptions.map((width) => (
                  <button
                    key={width}
                    type="button"
                    className={styles.lineWidthStepButton}
                    onClick={() => dispatch(setSensorChartLineWidth(width))}
                    title={`Толщина линии ${width}`}
                    aria-label={`Толщина линии ${width}`}
                  >
                    {width}
                  </button>
                )) : null}
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
          </div>

          {historyStats && (
            <div className={styles.chartStats}>
              {historyStats.cards.map((card) => (
                <article key={card.label} className={styles.chartStatCard}>
                  <span className={styles.chartStatLabel}>{card.label}</span>
                  <strong className={styles.chartStatValue}>{card.value}</strong>
                  {card.meta ? <span className={styles.chartStatTime}>{card.meta}</span> : null}
                </article>
              ))}
            </div>
          )}

          {historyLoading ? (
            <div className={styles.chartEmpty}>Загружаем график...</div>
          ) : chartOption ? (
            <div className={`${styles.chartWrap} ${chartExpanded ? styles.chartWrapExpanded : ""}`}>
              <ReactEChartsCore
                echarts={echarts}
                option={chartOption}
                notMerge
                lazyUpdate
                className={`${styles.chartCanvas} ${chartExpanded ? styles.chartCanvasExpanded : ""}`}
              />
            </div>
          ) : (
            <div className={styles.chartEmpty}>За выбранный период нет данных.</div>
          )}
        </div>
      )}
    </Modal>
  );
}
