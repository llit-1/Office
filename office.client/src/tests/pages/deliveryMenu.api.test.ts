import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeliveryItemPayload } from "../../Pages/DeliveryMenu/deliveryMenu.types";

const apiMocks = vi.hoisted(() => ({
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock("../../Services/api", () => ({
  ApiError: class ApiError extends Error {},
  del: vi.fn(),
  get: vi.fn(),
  patch: vi.fn(),
  post: apiMocks.post,
  put: apiMocks.put,
}));

import { createDeliveryItem, updateDeliveryItem } from "../../Pages/DeliveryMenu/deliveryMenu.api";

const payload: DeliveryItemPayload = {
  rkcode: 101,
  yeGroup: 10,
  rkName: "Маргарита RK",
  yeName: "Маргарита",
  description: "Томаты и сыр",
  price: 550,
  measure: 500,
  measureUnit: "гр",
  imageHash: "hash-that-must-not-be-sent",
  actual: 1,
  image: "base64-image",
  stops: [],
};

describe("delivery menu item requests", () => {
  beforeEach(() => {
    apiMocks.post.mockReset();
    apiMocks.put.mockReset();
  });

  it("sends an empty image hash when creating an item", async () => {
    await createDeliveryItem(payload);

    expect(apiMocks.post).toHaveBeenCalledWith("/DeliveryMenu/items", {
      ...payload,
      imageHash: "",
      group: null,
    });
  });

  it("sends an empty image hash when updating an item", async () => {
    await updateDeliveryItem(payload.rkcode, payload);

    expect(apiMocks.put).toHaveBeenCalledWith(`/DeliveryMenu/items/${payload.rkcode}`, {
      ...payload,
      imageHash: "",
      group: null,
    });
  });
});
