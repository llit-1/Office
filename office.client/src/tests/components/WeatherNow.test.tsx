import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WeatherNow, {
  currentPartName,
  formatTemperature,
  weatherKind,
  type WeatherNowData,
} from "../../Components/WeatherNow/WeatherNow";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("../../Services/api", () => ({ get: (...args: unknown[]) => getMock(...args) }));

const day: WeatherNowData = {
  temperature: -3,
  code: 3,
  description: "пасмурно",
  place: "Заставская 30",
  updatedAt: "14:00",
  parts: [
    { name: "Утро", temperature: -5, code: 3, description: "пасмурно" },
    { name: "День", temperature: -3, code: 3, description: "пасмурно" },
    { name: "Вечер", temperature: -4, code: 73, description: "снег" },
    { name: "Ночь", temperature: -7, code: 0, description: "ясно" },
  ],
  precipitation: "Снег вечером, до 2 см",
};

describe("WeatherNow", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("shows the temperature now and opens the day by parts on click", async () => {
    getMock.mockResolvedValue(day);
    render(<WeatherNow />);

    const button = await screen.findByRole("button", { name: "Погода: Заставская 30, пасмурно, −3°" });
    expect(button).toHaveTextContent("−3°");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(button);

    const dialog = within(screen.getByRole("dialog", { name: "Прогноз на сегодня" }));
    expect(dialog.getByText("Заставская 30 · сегодня")).toBeInTheDocument();
    expect(dialog.getByText("обновлено в 14:00")).toBeInTheDocument();
    expect(dialog.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Утро−5°", "День−3°", "Вечер−4°", "Ночь−7°",
    ]);
    expect(dialog.getByLabelText("снег")).toBeInTheDocument();
    expect(dialog.getByText("Снег вечером, до 2 см")).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("/Weather");
  });

  it("closes on a click elsewhere and on Escape", async () => {
    getMock.mockResolvedValue({ ...day, precipitation: null });
    render(<WeatherNow />);
    const button = await screen.findByRole("button", { name: /Погода/ });

    fireEvent.click(button);
    expect(screen.queryByText(/Снег вечером/)).not.toBeInTheDocument(); // no line when it stays dry
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(button);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows nothing when there is no weather", async () => {
    getMock.mockResolvedValue("");
    const { container } = render(<WeatherNow />);

    await vi.waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("shows nothing when the request fails", async () => {
    getMock.mockRejectedValue(new Error("network"));
    const { container } = render(<WeatherNow />);

    await vi.waitFor(() => expect(getMock).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("colours the header and every part by its kind of weather, marks frost and the part going on now", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 19, 19, 30));
    try {
      getMock.mockResolvedValue(day);
      render(<WeatherNow />);
      const button = await screen.findByRole("button", { name: /Погода/ });
      expect(button).toHaveAttribute("data-kind", "cloud");

      fireEvent.click(button);
      const parts = screen.getAllByRole("listitem");
      expect(parts.map((part) => part.getAttribute("data-kind"))).toEqual(["cloud", "cloud", "snow", "sun"]);
      expect(parts.map((part) => part.hasAttribute("data-now"))).toEqual([false, false, true, false]);
      expect(within(parts[0]).getByText("−5°")).toHaveAttribute("data-frost", "true");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [0, "sun"], [2, "partly"], [3, "cloud"], [45, "cloud"], [53, "drizzle"], [63, "rain"], [81, "rain"], [75, "snow"], [86, "snow"], [96, "storm"],
  ])("code %i is %s", (code, kind) => {
    expect(weatherKind(code)).toBe(kind);
  });

  it.each([
    [3, "Ночь"], [6, "Утро"], [11, "Утро"], [12, "День"], [18, "Вечер"], [23, "Вечер"],
  ])("at %i o'clock it is %s", (hour, part) => {
    expect(currentPartName(new Date(2026, 10, 19, hour, 0))).toBe(part);
  });

  it("writes temperatures with a sign and no minus zero", () => {
    expect([formatTemperature(5), formatTemperature(0), formatTemperature(-2)]).toEqual(["+5°", "0°", "−2°"]);
  });
});
