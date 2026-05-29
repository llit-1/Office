import { describe, expect, it } from "vitest";
import preferencesReducer, {
  setNotificationSoundEnabled,
} from "../../Store/preferencesSlice";

describe("preferencesSlice", () => {
  it("enables notification sound by default", () => {
    expect(
      preferencesReducer(undefined, { type: "unknown" })
        .notificationSoundEnabled
    ).toBe(true);
  });

  it("updates notification sound preference", () => {
    const state = preferencesReducer(
      undefined,
      setNotificationSoundEnabled(false)
    );

    expect(state.notificationSoundEnabled).toBe(false);
  });
});
