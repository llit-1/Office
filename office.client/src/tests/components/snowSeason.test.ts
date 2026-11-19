import { describe, expect, it } from "vitest";
import { isSnowSeason, shouldShowSnow } from "../../Components/Snowfall/snowSeason";

describe("snow season", () => {
  it.each([
    [new Date(2026, 10, 14), false],
    [new Date(2026, 10, 15), true],
    [new Date(2026, 11, 31), true],
    [new Date(2027, 0, 15), true],
    [new Date(2028, 1, 29), true],
    [new Date(2027, 2, 1), false],
    [new Date(2026, 6, 1), false],
  ])("%s is in season: %s", (date, expected) => {
    expect(isSnowSeason(date)).toBe(expected);
  });

  it("follows the user's choice in season and the system motion setting until there is one", () => {
    const december = new Date(2026, 11, 20);
    expect(shouldShowSnow(december, null, false)).toBe(true);
    expect(shouldShowSnow(december, null, true)).toBe(false);
    expect(shouldShowSnow(december, true, true)).toBe(true);
    expect(shouldShowSnow(december, false, false)).toBe(false);
  });

  it("never snows out of season, whatever the user chose", () => {
    expect(shouldShowSnow(new Date(2026, 5, 1), true, false)).toBe(false);
  });
});
