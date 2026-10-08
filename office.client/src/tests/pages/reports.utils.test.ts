import { describe, expect, it } from "vitest";
import {
  formatFileSize,
  formatReportValue,
  presetRange,
  validatePeriod,
} from "../../Pages/Reports/reports.utils";

describe("reports utils", () => {
  it("builds period presets in the local calendar", () => {
    const today = new Date(2024, 2, 15);
    expect(presetRange("current-month", today)).toEqual({ from: "2024-03-01", to: "2024-03-15" });
    expect(presetRange("previous-month", today)).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(presetRange("last-7-days", today)).toEqual({ from: "2024-03-09", to: "2024-03-15" });
  });

  it("validates the franchisee period like the server", () => {
    expect(validatePeriod("", "2024-03-01", 40)).toBe("Укажите начало и конец периода.");
    expect(validatePeriod("2024-03-02", "2024-03-01", 40)).toBe("Дата начала не может быть позже даты окончания.");
    expect(validatePeriod("2024-03-01", "2024-04-10", 40)).toBeNull();
    expect(validatePeriod("2024-03-01", "2024-04-11", 40)).toBe("Период не должен превышать 40 дней.");
  });

  it("formats report values for Russian users", () => {
    expect(formatReportValue(1234.5, "money")).toBe("1 234,50");
    expect(formatReportValue(2.5, "number")).toBe("2,5");
    expect(formatReportValue("2024-03-05T12:30:00", "datetime")).toBe("05.03.2024 12:30");
    expect(formatReportValue(null, "text")).toBe("—");
    expect(formatFileSize(512)).toBe("512 Б");
    expect(formatFileSize(1536)).toBe("1,5 КБ");
  });
});
