import { describe, expect, it } from "vitest";
import {
  columnLabel,
  columnsOf,
  findRowId,
  findRows,
  formatCell,
  formatValue,
  parseList,
  presetRange,
  statusInfo,
  toIsoSeconds,
} from "../../Pages/DeliveryMenu/deliveryRequests.utils";
import { describeLogEntry, errorSummary } from "../../Pages/DeliveryMenu/orderLogs.utils";

describe("Yandex response parsing", () => {
  it("finds the list of records whatever wrapper it arrives in", () => {
    expect(findRows([{ id: 1 }, "skip", { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
    expect(findRows({ blocks: [{ id: "b1" }] })).toEqual([{ id: "b1" }]);
    expect(findRows({ payload: { data: [{ id: "b2" }] } })).toEqual([{ id: "b2" }]);
    expect(findRows({ meta: { total: 0 }, unknownKey: [{ id: "b3" }] })).toEqual([{ id: "b3" }]);
    expect(findRows({ status: "ok" })).toEqual([]);
    expect(findRows(null)).toEqual([]);
  });

  it("collects columns in order of first appearance", () => {
    expect(columnsOf([{ id: 1, status: "active" }, { id: 2, tag: "kitchen" }]))
      .toEqual(["id", "status", "tag"]);
    expect(columnsOf([{ a: 1, b: 2, c: 3 }], 2)).toEqual(["a", "b"]);
  });

  it("recognises an identifier under any of the known names", () => {
    expect(findRowId({ blockId: " b-7 " })).toBe("b-7");
    expect(findRowId({ eats_id: 42 })).toBe("42");
    expect(findRowId({ title: "no id here" })).toBeNull();
  });

  it("formats cells for reading without hiding data", () => {
    expect(formatCell(null)).toBe("—");
    expect(formatCell(true)).toBe("Да");
    expect(formatCell("2026-09-16T10:00:00")).toContain("2026");
    expect(formatCell({ nested: 1 })).toBe("{\"nested\":1}");
    expect(formatCell("x".repeat(200))).toHaveLength(121);
  });

  it("parses lists typed by hand and completes the datetime value", () => {
    expect(parseList(" active, scheduled;active \n done ")).toEqual(["active", "scheduled", "done"]);
    expect(parseList("   ")).toEqual([]);
    expect(toIsoSeconds("2026-09-16T10:00")).toBe("2026-09-16T10:00:00");
    expect(toIsoSeconds("")).toBe("");
  });
});

describe("Yandex fields for people", () => {
  it("names known columns in Russian and keeps unknown ones as is", () => {
    expect(columnLabel("created_at")).toBe("Создан");
    expect(columnLabel("EATS_ID")).toBe("Номер");
    expect(columnLabel("custom_field")).toBe("custom_field");
  });

  it("translates statuses whatever case they arrive in", () => {
    expect(statusInfo("DELIVERED")).toEqual({ label: "Доставлен", tone: "success" });
    expect(statusInfo("active")).toEqual({ label: "Действует", tone: "danger" });
    expect(statusInfo("mystery")).toEqual({ label: "mystery", tone: "neutral" });
    expect(statusInfo("")).toBeNull();
  });

  it("shows money with a rouble sign and reasons without JSON", () => {
    expect(formatValue("items_cost", 1289)).toBe(`${(1289).toLocaleString("ru-RU")} ₽`);
    expect(formatValue("cancel_reason", { code: "service.test_connection" })).toBe("service.test_connection");
    expect(formatValue("other", { nested: 1 })).toBe("{\"nested\":1}");
  });

  it("builds period presets from the start of the day", () => {
    const now = new Date(2026, 8, 23, 11, 11);
    expect(presetRange("today", now)).toEqual({ from: "2026-09-23T00:00", to: "2026-09-23T11:11" });
    expect(presetRange("yesterday", now)).toEqual({ from: "2026-09-22T00:00", to: "2026-09-23T00:00" });
    expect(presetRange("week", now)).toEqual({ from: "2026-09-17T00:00", to: "2026-09-23T11:11" });
  });
});

describe("order log entries", () => {
  it("names yeapi calls by what Yandex was doing", () => {
    expect(describeLogEntry({ type: "POST", url: "/order" })).toBe("Создание заказа");
    expect(describeLogEntry({ type: "DELETE", url: "/order/260922-1637426" })).toBe("Отмена заказа");
    expect(describeLogEntry({ type: "PUT", url: "/order/1/status" })).toBe("Смена статуса");
    expect(describeLogEntry({ type: "GET", url: "/order/1/status" })).toBe("Запрос статуса");
    expect(describeLogEntry({ type: "PATCH", url: "/other" })).toBe("PATCH /other");
  });

  it("turns validation errors into readable lines", () => {
    expect(errorSummary(JSON.stringify({ title: "x", errors: { Platform: ["required"], RestaurantId: ["required"] } })))
      .toEqual(["Platform: required", "RestaurantId: required"]);
    expect(errorSummary(JSON.stringify({ message: "Блюдо в стопе" }))).toEqual(["Блюдо в стопе"]);
    expect(errorSummary("plain text")).toEqual(["plain text"]);
    expect(errorSummary(null)).toEqual([]);
  });
});
