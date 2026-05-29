import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, callApi, getFriendlyErrorMessage } from "../../Services/api";

describe("api helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns friendly message for unauthorized api error", () => {
    expect(getFriendlyErrorMessage(new ApiError("x", 401))).toContain(
      "авториза"
    );
  });

  it("returns fallback for unknown errors", () => {
    expect(getFriendlyErrorMessage(new Error("boom"), "fallback")).toBe(
      "fallback"
    );
  });

  it("returns successful callApi result", async () => {
    const result = await callApi(Promise.resolve({ ok: 1 }));

    expect(result).toEqual({ ok: true, data: { ok: 1 } });
  });

  it("returns ApiError from failed callApi and notifies", async () => {
    const show = vi.fn();
    const error = new ApiError("Forbidden", 403);

    const result = await callApi(Promise.reject(error), {
      notifications: { show },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
    }
    expect(show).toHaveBeenCalled();
  });
});
