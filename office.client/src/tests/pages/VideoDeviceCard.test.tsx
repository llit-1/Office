import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DeviceCard from "../../Pages/VideoDevices/components/DeviceCard";
import DeviceDiagnosticsModal from "../../Pages/VideoDevices/components/DeviceDiagnosticsModal";
import type { Device, DevicePresence } from "../../Pages/VideoDevices/videoDevices.types";
import { isNewerVersion, isOutdatedVersion, problemsLabel } from "../../Pages/VideoDevices/videoDevices.utils";

const noop = () => undefined;

const baseDevice: Device = {
  guid: "90faffdd-9ad1-489f-bb09-0ab3e5d26e0a",
  locationName: "00 Тестовая ТТ",
  ip: "10.140.31.246:8080",
  videoList: "[TV1_06112026.mp4]",
  onlyMusic: null,
  version: "2.0",
  isTestLocation: true,
};

const presence: DevicePresence = {
  status: "playing",
  lastSeenUtc: new Date().toISOString(),
  problems: [],
  muted: false,
  itemsReady: 1,
  itemsTotal: 1,
  currentFile: "TV1_06112026.mp4",
};

function renderCard(device: Device, serverVersion = "1.9") {
  return render(
    <DeviceCard
      device={device}
      serverVersion={serverVersion}
      onOpen={noop}
      onCheck={noop}
      onStartApp={noop}
      onUpdateApp={noop}
      onScreenshot={noop}
      onReload={noop}
    />,
  );
}

describe("версии приставок", () => {
  it("устаревшей считается только версия старше серверной", () => {
    expect(isOutdatedVersion("1.8", "1.9")).toBe(true);
    expect(isOutdatedVersion("1.9", "1.10")).toBe(true);
    expect(isOutdatedVersion("2.0", "1.9")).toBe(false);
    expect(isOutdatedVersion("1.9", "1.9")).toBe(false);
    expect(isNewerVersion("2.0", "1.9")).toBe(true);
    expect(isOutdatedVersion(null, "1.9")).toBe(false);
  });
});

describe("карточка приставки", () => {
  it("показывает статус плашкой рядом с названием ТТ", () => {
    renderCard({ ...baseDevice, presence });

    const pill = screen.getByText("Показывает").parentElement!;
    expect(pill.parentElement).toHaveTextContent("00 Тестовая ТТ");
    expect(pill).toHaveAttribute("title", expect.stringContaining("TV1_06112026.mp4"));
  });

  it("пишет, сколько нет связи", () => {
    renderCard({ ...baseDevice, presence: { ...presence, status: "offline", lastSeenUtc: new Date(Date.now() - 23 * 60_000).toISOString() } });

    expect(screen.getByText("Нет связи 23 мин")).toBeInTheDocument();
  });

  it("не предлагает «обновить» более новую тестовую версию", () => {
    renderCard({ ...baseDevice, presence });

    expect(screen.getByText("2.0")).toHaveAttribute("title", "Новее серверной (1.9)");
    expect(screen.queryByLabelText("Обновить приложение")).not.toBeInTheDocument();
  });

  it("для старого приложения без сигналов оставляет прежний индикатор", () => {
    renderCard({ ...baseDevice, version: "1.8", presence: null });

    expect(screen.queryByText("Показывает")).not.toBeInTheDocument();
    expect(screen.getByText("1.8")).toHaveAttribute("title", "Сервер: 1.9");
  });
});

describe("диагностика приставки", () => {
  const diagnosed: DevicePresence = {
    ...presence,
    status: "problem",
    mode: "video",
    problems: ["Экран не подключён (HDMI)", "Часы приставки отстают на 2 ч", "Мало места: 120 МБ"],
    notices: ["Слабый Wi-Fi: -82 дБм"],
    hdmiConnected: false,
    clockSkewSeconds: -7200,
    freeSpaceMb: 120,
    networkType: "wifi",
    wifiRssi: -82,
    downloadKbps: 2048,
    portalHost: "office.ludilove.ru",
  };

  it("много проблем — карточка выделена, на плашке их число, кнопка диагностики подсвечена", () => {
    const onDiagnostics = vi.fn();
    render(
      <DeviceCard
        device={{ ...baseDevice, presence: diagnosed }}
        serverVersion="1.9"
        onOpen={noop}
        onCheck={noop}
        onStartApp={noop}
        onUpdateApp={noop}
        onScreenshot={noop}
        onReload={noop}
        onDiagnostics={onDiagnostics}
      />,
    );

    expect(screen.getByText("3 проблемы")).toBeInTheDocument();
    const button = screen.getByLabelText("Диагностика");
    expect(button).toHaveAttribute("title", "Диагностика: проблем 3");
    fireEvent.click(button);
    expect(onDiagnostics).toHaveBeenCalledTimes(1);
  });

  it("одна проблема — её короткое название", () => {
    renderCard({ ...baseDevice, presence: { ...diagnosed, problems: ["Мало места: 120 МБ"] } });
    expect(screen.getByText("Мало места: 120 МБ")).toBeInTheDocument();
    expect(problemsLabel(5)).toBe("5 проблем");
    expect(problemsLabel(21)).toBe("21 проблема");
    expect(problemsLabel(12)).toBe("12 проблем");
  });

  it("окно показывает проблемы, замечания, факты и отправляет команды", () => {
    const onCommand = vi.fn();
    render(
      <DeviceDiagnosticsModal
        device={{ ...baseDevice, presence: diagnosed }}
        onClose={noop}
        onCommand={onCommand}
        onScreenshot={noop}
        onReload={noop}
      />,
    );

    expect(screen.getByText("Проблемы · 3")).toBeInTheDocument();
    expect(screen.getByText("Слабый Wi-Fi: -82 дБм")).toBeInTheDocument();
    expect(screen.getByText("отстают на 2 ч")).toBeInTheDocument();
    expect(screen.getByText("Wi-Fi, -82 дБм")).toBeInTheDocument();
    expect(screen.getByText("2,0 МБ/с")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Синхронизировать"));
    expect(onCommand).toHaveBeenLastCalledWith(expect.objectContaining({ guid: baseDevice.guid }), "sync");

    // «Перекачать файл» убран из окна
    expect(screen.queryByText("Перекачать")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Громкость музыки, %"), { target: { value: "70" } });
    fireEvent.click(screen.getByText("Установить"));
    expect(onCommand).toHaveBeenLastCalledWith(expect.anything(), "volume", 70);

    // Перезагрузка — только после подтверждения
    fireEvent.click(screen.getByText("Перезагрузить приставку"));
    expect(onCommand).not.toHaveBeenLastCalledWith(expect.anything(), "reboot");
    fireEvent.click(screen.getByText("Перезагрузить"));
    expect(onCommand).toHaveBeenLastCalledWith(expect.anything(), "reboot");
  });

  it("без root и прав владельца — перезагрузка недоступна, предлагает выдать права", () => {
    const onGrantOwner = vi.fn();
    render(
      <DeviceDiagnosticsModal
        device={{ ...baseDevice, presence: { ...diagnosed, hasRoot: false, deviceOwner: false } }}
        onClose={noop}
        onCommand={noop}
        onScreenshot={noop}
        onReload={noop}
        onGrantOwner={onGrantOwner}
      />,
    );
    expect(screen.getByText("Перезагрузить приставку").closest("button")).toBeDisabled();
    expect(screen.getByText("Скриншот").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByText("Выдать права владельца (ADB)"));
    expect(onGrantOwner).toHaveBeenCalledTimes(1);
  });

  it("для старого приложения объясняет, что диагностики нет", () => {
    render(
      <DeviceDiagnosticsModal device={{ ...baseDevice, presence: null }} onClose={noop} onCommand={noop} onScreenshot={noop} onReload={noop} />,
    );
    expect(screen.getByText(/старое приложение/)).toBeInTheDocument();
  });
});
