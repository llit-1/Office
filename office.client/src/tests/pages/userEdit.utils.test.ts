import { describe, expect, it } from "vitest";
import { getSavedTtSettings, resolveTtSettings } from "../../Pages/Users/userEdit.utils";

describe("настройки привязки ТТ пользователя", () => {
  it("восстанавливает включённый тумблер для режима всех ТТ", () => {
    expect(resolveTtSettings(1, 0)).toEqual({ isTT: true, ttBinding: "allTT" });
  });

  it("восстанавливает ручную привязку по выбранным локациям", () => {
    expect(resolveTtSettings(0, 2)).toEqual({ isTT: true, ttBinding: "manualTT" });
  });

  it("сохраняет режим всех ТТ через DefaultLocations", () => {
    expect(getSavedTtSettings(true, "allTT", ["location-guid"])).toEqual({
      defaultLocations: 1,
      locations: [],
    });
  });

  it("очищает обе привязки при выключенном тумблере", () => {
    expect(getSavedTtSettings(false, "manualTT", ["location-guid"])).toEqual({
      defaultLocations: 0,
      locations: [],
    });
  });
});
