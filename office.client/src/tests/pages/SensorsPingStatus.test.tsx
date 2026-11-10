import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import SensorsCardsTab from "../../Pages/Sensors/components/SensorsCardsTab";
import styles from "../../Pages/Sensors/Sensors.module.css";
import type { SensorRow } from "../../Pages/Sensors/sensors.types";

const sensors: SensorRow[] = [
  { id: 1, name: "Холодильник", ip: "10.0.0.1", temp: null, actual: 0, state: "OK", hasAlertSettings: true },
  { id: 2, name: "Витрина", ip: "10.0.0.2", temp: null, actual: 1, state: "OK", hasAlertSettings: true },
];

const handlers = {
  onSearchTextChange: vi.fn(),
  onStatusFilterChange: vi.fn(),
  onCreateSensor: vi.fn(),
  onEditSensor: vi.fn(),
  onOpenRuleSettings: vi.fn(),
  onOpenChart: vi.fn(),
};

it("shows ping separately from the configured sensor activity", () => {
  const view = render(
    <SensorsCardsTab
      sensors={sensors}
      filteredSensors={sensors}
      pingStatuses={{ 1: "online", 2: "offline" }}
      pingCheckFinished={true}
      sensorsLoading={false}
      searchText=""
      statusFilter="all"
      canManageDevices={false}
      {...handlers}
    />,
  );

  const inactiveCard = screen.getByText("Холодильник").closest("article")!;
  const onlineIp = within(inactiveCard).getByText("10.0.0.1");
  expect(onlineIp).toHaveClass(styles.sensorIpOnline);
  expect(onlineIp).toHaveAttribute("title", "IP 10.0.0.1 — Ping есть");
  expect(inactiveCard).toHaveAttribute("title", "Датчик неактивен");
  const offlineIp = within(screen.getByText("Витрина").closest("article")!).getByText("10.0.0.2");
  expect(offlineIp).toHaveClass(styles.sensorIpOffline);
  expect(offlineIp).toHaveAttribute("aria-label", "IP 10.0.0.2 — Нет ping");
  expect(screen.queryByText("Ping есть")).not.toBeInTheDocument();

  view.rerender(
    <SensorsCardsTab
      sensors={sensors}
      filteredSensors={sensors}
      pingStatuses={{}}
      pingCheckFinished={false}
      sensorsLoading={false}
      searchText=""
      statusFilter="all"
      canManageDevices={false}
      {...handlers}
    />,
  );
  expect(screen.getByText("10.0.0.1")).toHaveClass(styles.sensorIpNeutral);
  expect(screen.getByText("10.0.0.1")).toHaveAttribute("title", "IP 10.0.0.1 — Проверяем ping");
});
