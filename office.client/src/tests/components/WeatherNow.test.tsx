import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import WeatherNow, {
  formatRain,
  formatTemperature,
  weatherKind,
  type WeatherNowData,
} from "../../Components/WeatherNow/WeatherNow";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("../../Services/api", () => ({ get: (...args: unknown[]) => getMock(...args) }));

const week: WeatherNowData = {
  temperature: 2,
  code: 63,
  description: "дождь",
  place: "Санкт-Петербург",
  days: [
    { date: "2026-11-19", name: "Сегодня", temperature: 2, code: 63, description: "дождь", rain: 1 },
    { date: "2026-11-20", name: "Завтра", temperature: 4, code: 3, description: "пасмурно", rain: 0 },
    { date: "2026-11-21", name: "Сб 21", temperature: -3, code: 73, description: "снег", rain: 2.4 },
  ],
};

describe("WeatherNow", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("shows today's temperature and opens the week on click", async () => {
    getMock.mockResolvedValue(week);
    render(<WeatherNow />);

    const button = await screen.findByRole("button", { name: "Погода: Санкт-Петербург, дождь, +2°" });
    expect(button).toHaveTextContent("+2°");
    expect(button).toHaveAttribute("data-kind", "rain");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(button);

    const dialog = within(screen.getByRole("dialog", { name: "Прогноз на неделю" }));
    const days = dialog.getAllByRole("listitem");
    expect(days.map((day) => day.textContent)).toEqual(["Сегодня+2°1 мм", "Завтра+4°", "Сб 21−3°2,4 мм"]);
    expect(days.map((day) => day.getAttribute("data-kind"))).toEqual(["rain", "cloud", "snow"]);
    expect(days.map((day) => day.hasAttribute("data-now"))).toEqual([true, false, false]);
    expect(within(days[2]).getByText("−3°")).toHaveAttribute("data-frost", "true");
    expect(getMock).toHaveBeenCalledWith("/Weather");
  });

  it("closes on a click elsewhere and on Escape", async () => {
    getMock.mockResolvedValue(week);
    render(<WeatherNow />);
    const button = await screen.findByRole("button", { name: /Погода/ });

    fireEvent.click(button);
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

  it.each([
    [0, "sun"], [2, "partly"], [3, "cloud"], [53, "drizzle"], [63, "rain"], [71, "snow"], [73, "snow"],
  ])("code %i is %s", (code, kind) => {
    expect(weatherKind(code)).toBe(kind);
  });

  it("writes temperatures with a sign and no minus zero, rain in millimetres", () => {
    expect([formatTemperature(5), formatTemperature(0), formatTemperature(-2)]).toEqual(["+5°", "0°", "−2°"]);
    expect([formatRain(1), formatRain(0.42)]).toEqual(["1 мм", "0,4 мм"]);
  });
});
