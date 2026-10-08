import { describe, expect, it } from "vitest";
import { formatObjectCode, formatStockDateTime, objectsLabel, toObjectCode } from "../../Pages/Stock/stock.utils";

describe("stock utils", () => {
  it("normalizes scanner input typed in Russian layout and pads short codes", () => {
    expect(toObjectCode("фисвуа")).toBe("ABCDEF".padStart(24, "0"));
    expect(toObjectCode(" e280 11 ")).toBe("E28011".padStart(24, "0"));
    expect(toObjectCode("E28011700000020F1A2B3C4D")).toBe("E28011700000020F1A2B3C4D");
  });

  it("rejects values that are not RFID codes", () => {
    expect(toObjectCode("")).toBeNull();
    expect(toObjectCode("XYZ")).toBeNull();
    expect(toObjectCode("0".repeat(25))).toBeNull();
  });

  it("formats codes, warehouse dates and object counts", () => {
    expect(formatObjectCode("E28011700000020F1A2B3C4D")).toBe("E280 1170 0000 020F 1A2B 3C4D");
    expect(formatStockDateTime("2024-03-05T12:30:59.123")).toBe("05.03.2024 12:30");
    expect(formatStockDateTime(null)).toBe("—");
    expect(objectsLabel(1)).toBe("1 объект");
    expect(objectsLabel(3)).toBe("3 объекта");
    expect(objectsLabel(11)).toBe("11 объектов");
    expect(objectsLabel(21)).toBe("21 объект");
  });
});
