import { describe, expect, it } from "vitest";
import { isPointInMaintenanceWindow } from "../../Pages/Sensors/components/SensorHistoryModal";
import type { MaintenanceWindowItem } from "../../Pages/Sensors/sensors.types";

function makeWindow(overrides: Partial<MaintenanceWindowItem> = {}): MaintenanceWindowItem {
  return {
    id: 4,
    roomId: 9,
    name: "Плановый простой",
    scheduleType: "one_time",
    daysOfWeekMask: null,
    startTime: "13:00:00",
    endTime: "10:00:00",
    startDate: "2026-08-21",
    endDate: "2026-08-22",
    isEnabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
    ...overrides,
  } as MaintenanceWindowItem;
}

const at = (value: string) => new Date(value).toISOString();

describe("isPointInMaintenanceWindow — разовое окно", () => {
  const windows = [makeWindow()];

  it("не считает техработами время до начала в первый день", () => {
    expect(isPointInMaintenanceWindow(at("2026-08-21T03:00:00"), windows)).toBe(false);
    expect(isPointInMaintenanceWindow(at("2026-08-21T12:59:00"), windows)).toBe(false);
  });

  it("покрывает непрерывный отрезок от начала до конца, включая ночь", () => {
    expect(isPointInMaintenanceWindow(at("2026-08-21T13:00:00"), windows)).toBe(true);
    expect(isPointInMaintenanceWindow(at("2026-08-21T20:33:00"), windows)).toBe(true);
    expect(isPointInMaintenanceWindow(at("2026-08-22T02:00:00"), windows)).toBe(true);
    expect(isPointInMaintenanceWindow(at("2026-08-22T10:00:00"), windows)).toBe(true);
  });

  it("не считает техработами время после окончания в последний день", () => {
    expect(isPointInMaintenanceWindow(at("2026-08-22T10:01:00"), windows)).toBe(false);
    expect(isPointInMaintenanceWindow(at("2026-08-22T15:00:00"), windows)).toBe(false);
    expect(isPointInMaintenanceWindow(at("2026-08-22T23:00:00"), windows)).toBe(false);
  });

  it("не выходит за пределы диапазона дат", () => {
    expect(isPointInMaintenanceWindow(at("2026-08-20T20:00:00"), windows)).toBe(false);
    expect(isPointInMaintenanceWindow(at("2026-08-23T03:00:00"), windows)).toBe(false);
  });

  it("работает для окна внутри одних суток", () => {
    const sameDay = [makeWindow({ startTime: "13:00:00", endTime: "15:00:00", endDate: "2026-08-21" })];
    expect(isPointInMaintenanceWindow(at("2026-08-21T12:59:00"), sameDay)).toBe(false);
    expect(isPointInMaintenanceWindow(at("2026-08-21T14:00:00"), sameDay)).toBe(true);
    expect(isPointInMaintenanceWindow(at("2026-08-21T15:01:00"), sameDay)).toBe(false);
    expect(isPointInMaintenanceWindow(at("2026-08-21T23:00:00"), sameDay)).toBe(false);
  });

  it("ничего не подавляет при перевёрнутом интервале", () => {
    const inverted = [makeWindow({ startTime: "15:00:00", endTime: "13:00:00", endDate: "2026-08-21" })];
    expect(isPointInMaintenanceWindow(at("2026-08-21T14:00:00"), inverted)).toBe(false);
  });

  it("игнорирует выключенное окно", () => {
    expect(isPointInMaintenanceWindow(at("2026-08-21T20:33:00"), [makeWindow({ isEnabled: false })])).toBe(false);
  });

  it("игнорирует окно без дат", () => {
    expect(isPointInMaintenanceWindow(at("2026-08-21T20:33:00"), [makeWindow({ startDate: null })])).toBe(false);
  });
});

describe("isPointInMaintenanceWindow — ежедневные и еженедельные окна", () => {
  it("сохраняет переход через полночь для ежедневного окна", () => {
    const daily = [makeWindow({ scheduleType: "daily", startTime: "22:00:00", endTime: "06:00:00" })];
    expect(isPointInMaintenanceWindow(at("2026-08-21T23:00:00"), daily)).toBe(true);
    expect(isPointInMaintenanceWindow(at("2026-08-21T03:00:00"), daily)).toBe(true);
    expect(isPointInMaintenanceWindow(at("2026-08-21T12:00:00"), daily)).toBe(false);
  });

  it("применяет ежедневное окно независимо от дат", () => {
    const daily = [makeWindow({ scheduleType: "daily", startTime: "13:00:00", endTime: "15:00:00" })];
    expect(isPointInMaintenanceWindow(at("2026-09-25T14:00:00"), daily)).toBe(true);
  });

  it("учитывает маску дней недели", () => {
    // 21.08.2026 — пятница, бит 4; 22.08 — суббота
    const weekly = [
      makeWindow({ scheduleType: "weekly", daysOfWeekMask: 1 << 4, startTime: "13:00:00", endTime: "15:00:00" }),
    ];
    expect(isPointInMaintenanceWindow(at("2026-08-21T14:00:00"), weekly)).toBe(true);
    expect(isPointInMaintenanceWindow(at("2026-08-22T14:00:00"), weekly)).toBe(false);
  });

  it("не подавляет точки до момента создания правила", () => {
    const daily = [
      makeWindow({
        scheduleType: "daily",
        startTime: "13:00:00",
        endTime: "15:00:00",
        createdAt: "2026-08-25T00:00:00.000Z",
      }),
    ];
    expect(isPointInMaintenanceWindow(at("2026-08-21T14:00:00"), daily)).toBe(false);
    expect(isPointInMaintenanceWindow(at("2026-08-26T14:00:00"), daily)).toBe(true);
  });

  it("перестаёт подавлять точки после удаления правила, но сохраняет их для периода, пока оно действовало", () => {
    const daily = [
      makeWindow({
        scheduleType: "daily",
        startTime: "13:00:00",
        endTime: "15:00:00",
        createdAt: "2026-08-20T00:00:00.000Z",
        deletedAt: "2026-08-25T00:00:00.000Z",
      }),
    ];
    expect(isPointInMaintenanceWindow(at("2026-08-21T14:00:00"), daily)).toBe(true);
    expect(isPointInMaintenanceWindow(at("2026-08-26T14:00:00"), daily)).toBe(false);
  });
});
