import { describe, expect, it } from "vitest";
import {
  flattenRkCategories,
  formatMeasureUnit,
  getImageBase64,
  getImageSource,
  toDisplayPrice,
} from "../../Pages/DeliveryMenu/deliveryMenu.utils";

describe("delivery menu helpers", () => {
  it("flattens nested R-Keeper categories and keeps their full path", () => {
    const result = flattenRkCategories([
      {
        code: 1,
        name: "Кухня",
        items: [{ code: 10, name: "Суп", price: 250 }],
        categories: [
          {
            code: 2,
            name: "Десерты",
            items: [{ code: 11, name: "Торт", price: 390 }],
            categories: [],
          },
        ],
      },
    ]);

    expect(result).toEqual([
      { code: 10, name: "Суп", price: 250, categoryPath: "Кухня" },
      { code: 11, name: "Торт", price: 390, categoryPath: "Кухня / Десерты" },
    ]);
  });

  it("creates an image data URL from the byte-array shape returned by ASP.NET", () => {
    const source = getImageSource([137, 80, 78, 71]);

    expect(source).toBe("data:image/png;base64,iVBORw==");
    expect(getImageBase64(source)).toBe("iVBORw==");
  });

  it("converts raw R-Keeper prices from kopecks to rubles", () => {
    expect(toDisplayPrice(14900)).toBe(149);
    expect(toDisplayPrice(8301)).toBe(83.01);
  });

  it("converts stored measure unit codes to labels", () => {
    expect(formatMeasureUnit("1")).toBe("гр");
    expect(formatMeasureUnit("2")).toBe("мл");
    expect(formatMeasureUnit("гр")).toBe("гр");
    expect(formatMeasureUnit("мл")).toBe("мл");
  });
});
