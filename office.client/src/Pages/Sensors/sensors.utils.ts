import type { AdDirectoryUser } from "../../Interfaces/Users";
import type {
  MaintenanceWindowFormState,
  MaintenanceWindowItem,
  NormalizedHistoryPoint,
  RuleSettingsFormState,
  SensorChatFormState,
  SensorHistoryPoint,
  SensorRuleSettings,
} from "./sensors.types";

export const periodOptions = [
  { hours: 24, label: "24ч" },
  { hours: 72, label: "3 дня" },
  { hours: 168, label: "7 дней" },
  { hours: 720, label: "30 дней" },
] as const;

export const scheduleTypeOptions = [
  { value: "daily", label: "Каждый день" },
  { value: "weekly", label: "Раз в неделю" },
  { value: "one_time", label: "Разовое окно" },
] as const;

export const weekDays = [
  { value: 1, label: "Пн" },
  { value: 2, label: "Вт" },
  { value: 4, label: "Ср" },
  { value: 8, label: "Чт" },
  { value: 16, label: "Пт" },
  { value: 32, label: "Сб" },
  { value: 64, label: "Вс" },
];

export const defaultSensorFormState = {
  name: "",
  ip: "",
  isActive: true,
};

export const defaultRuleSettingsFormState: RuleSettingsFormState = {
  minTemperature: "",
  maxTemperature: "",
  violationDelayMinutes: "15",
  repeatDelayMinutes: "60",
  recoveryDelayMinutes: "5",
  isEnabled: true,
};

export const defaultSensorChatFormState: SensorChatFormState = {
  name: "",
  roomIds: [],
  userLogins: [],
};

export const defaultMaintenanceWindowFormState: MaintenanceWindowFormState = {
  name: "",
  scheduleType: "daily",
  daysOfWeekMask: 0,
  startTime: "03:30",
  endTime: "08:50",
  startDate: "",
  endDate: "",
  isEnabled: true,
};

export function toApiTimeValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  return /^\d{2}:\d{2}$/.test(trimmed) ? `${trimmed}:00` : trimmed;
}

export function toFormTimeValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const trimmed = value.trim();
  return /^\d{2}:\d{2}:\d{2}$/.test(trimmed) ? trimmed.slice(0, 5) : trimmed;
}

export function normalizeTemperature(value: number | null) {
  if (value === null) {
    return null;
  }

  return value / 10;
}

export function normalizeHumidity(value: number | null) {
  if (value === null) {
    return null;
  }

  return value / 10;
}

export function formatAxisDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatShortAxisDate(value: string) {
  const date = new Date(value);
  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
  });
}

export function formatTemperatureLabel(value: number) {
  return `${value.toFixed(1)}°`;
}

export function formatHumidityLabel(value: number) {
  return `${value.toFixed(1)}%`;
}

export function normalizeHistory(points: SensorHistoryPoint[]) {
  return points
    .map((point) => ({
      id: point.id,
      date: point.date,
      temperature: normalizeTemperature(point.temperature),
      humidity: normalizeHumidity(point.humidity),
    }))
    .filter((point): point is NormalizedHistoryPoint => point.temperature !== null)
    .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
}

export function toRuleSettingsFormState(settings: SensorRuleSettings): RuleSettingsFormState {
  return {
    minTemperature: settings.minTemperature != null ? String(settings.minTemperature) : "",
    maxTemperature: settings.maxTemperature != null ? String(settings.maxTemperature) : "",
    violationDelayMinutes: String(settings.violationDelayMinutes),
    repeatDelayMinutes: String(settings.repeatDelayMinutes),
    recoveryDelayMinutes: String(settings.recoveryDelayMinutes),
    isEnabled: settings.isEnabled,
  };
}

export function toMaintenanceWindowFormState(window: MaintenanceWindowItem): MaintenanceWindowFormState {
  return {
    id: window.id,
    name: window.name,
    scheduleType: window.scheduleType,
    daysOfWeekMask: window.daysOfWeekMask ?? 0,
    startTime: toFormTimeValue(window.startTime),
    endTime: toFormTimeValue(window.endTime),
    startDate: window.startDate ?? "",
    endDate: window.endDate ?? "",
    isEnabled: window.isEnabled,
  };
}

export function formatMaintenanceSchedule(window: MaintenanceWindowItem | MaintenanceWindowFormState) {
  if (window.scheduleType === "daily") {
    return `Каждый день, ${window.startTime} - ${window.endTime}`;
  }

  if (window.scheduleType === "weekly") {
    const selectedDays = weekDays
      .filter((day) => (window.daysOfWeekMask ?? 0) & day.value)
      .map((day) => day.label)
      .join(", ");

    return `${selectedDays || "Нет дней"}, ${window.startTime} - ${window.endTime}`;
  }

  return `${window.startDate ?? "?"} - ${window.endDate ?? "?"}, ${window.startTime} - ${window.endTime}`;
}

export function formatTemperatureRange(minTemperature: number | null, maxTemperature: number | null) {
  if (minTemperature == null && maxTemperature == null) {
    return "Не задано";
  }

  if (minTemperature != null && maxTemperature != null) {
    return `${formatTemperatureLabel(minTemperature)} ... ${formatTemperatureLabel(maxTemperature)}`;
  }

  if (minTemperature != null) {
    return `От ${formatTemperatureLabel(minTemperature)}`;
  }

  return `До ${formatTemperatureLabel(maxTemperature as number)}`;
}

export function formatDelaySummary(
  violationDelayMinutes: number | null,
  repeatDelayMinutes: number | null,
  recoveryDelayMinutes: number | null,
) {
  if (violationDelayMinutes == null || repeatDelayMinutes == null || recoveryDelayMinutes == null) {
    return "Не задано";
  }

  return `${violationDelayMinutes} / ${repeatDelayMinutes} / ${recoveryDelayMinutes} мин`;
}

export function getAdUserLabel(user: AdDirectoryUser) {
  const name = user.fullName?.trim();
  return name ? `${name} [${user.login}]` : user.login;
}
