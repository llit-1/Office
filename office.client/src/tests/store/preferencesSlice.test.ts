import { describe, expect, it } from "vitest";
import preferencesReducer, {
  setNotificationSoundEnabled,
  setSensorChartExpanded,
  setSensorChartLineWidth,
} from "../../Store/preferencesSlice";

describe("preferencesSlice", () => {
  it("enables notification sound by default", () => {
    const state = preferencesReducer(undefined, { type: "unknown" });
    expect(state.notificationSoundEnabled).toBe(true);
    expect(state.sensorChartExpanded).toBe(false);
    expect(state.sensorChartLineWidth).toBe(2);
  });

  it("updates notification sound preference", () => {
    const state = preferencesReducer(
      undefined,
      setNotificationSoundEnabled(false)
    );

    expect(state.notificationSoundEnabled).toBe(false);
  });

  it("updates chart preferences", () => {
    const expandedState = preferencesReducer(undefined, setSensorChartExpanded(true));
    expect(expandedState.sensorChartExpanded).toBe(true);

    const widthState = preferencesReducer(undefined, setSensorChartLineWidth(1.5));
    expect(widthState.sensorChartLineWidth).toBe(1.5);

    const clampedState = preferencesReducer(undefined, setSensorChartLineWidth(99));
    expect(clampedState.sensorChartLineWidth).toBe(3);
  });
});
