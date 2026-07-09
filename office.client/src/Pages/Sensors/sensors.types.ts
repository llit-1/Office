export interface SensorRow {
  id: number;
  name: string;
  ip: string;
  temp: number | null;
  actual: number | null;
  state: string | null;
  hasAlertSettings: boolean;
}

export interface SensorHistoryPoint {
  id: number;
  roomId: number;
  roomName: string;
  temperature: number | null;
  humidity: number | null;
  date: string;
}

export interface NormalizedHistoryPoint {
  id: number;
  date: string;
  temperature: number;
  humidity: number | null;
}

export interface SensorFormState {
  name: string;
  ip: string;
  isActive: boolean;
}

export interface SensorRuleSettings {
  roomId: number;
  minTemperature: number | null;
  maxTemperature: number | null;
  violationDelayMinutes: number;
  repeatDelayMinutes: number;
  recoveryDelayMinutes: number;
  isEnabled: boolean;
  schemaMissing?: boolean;
  schemaMessage?: string;
}

export interface SensorRuleRow {
  id: number;
  roomId: number;
  sensorName: string;
  ip: string;
  hasSettings: boolean;
  minTemperature: number | null;
  maxTemperature: number | null;
  violationDelayMinutes: number | null;
  repeatDelayMinutes: number | null;
  recoveryDelayMinutes: number | null;
  isEnabled: boolean;
  maintenanceWindowsCount: number;
  maintenanceSummary: string | null;
  hasMaintenanceWindows: boolean;
}

export interface RuleSettingsFormState {
  minTemperature: string;
  maxTemperature: string;
  violationDelayMinutes: string;
  repeatDelayMinutes: string;
  recoveryDelayMinutes: string;
  isEnabled: boolean;
}

export type MaintenanceScheduleType = "daily" | "weekly" | "one_time";

export interface MaintenanceWindowItem {
  id: number;
  roomId: number;
  name: string;
  scheduleType: MaintenanceScheduleType;
  daysOfWeekMask: number | null;
  startTime: string;
  endTime: string;
  startDate: string | null;
  endDate: string | null;
  isEnabled: boolean;
}

export interface MaintenanceWindowFormState {
  id?: number;
  name: string;
  scheduleType: MaintenanceScheduleType;
  daysOfWeekMask: number;
  startTime: string;
  endTime: string;
  startDate: string;
  endDate: string;
  isEnabled: boolean;
}

export interface SensorChatRow {
  id: number;
  name: string;
  sensorsCount: number;
  usersCount: number;
  sensorsSummary: string | null;
  hasMoreSensors: boolean;
}

export interface SensorChatDetails {
  id: number;
  name: string;
  roomIds: number[];
  userLogins: string[];
}

export interface SensorChatFormState {
  name: string;
  roomIds: number[];
  userLogins: string[];
}
