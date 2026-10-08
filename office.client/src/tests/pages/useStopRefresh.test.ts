import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import useStopRefresh from "../../Pages/DeliveryMenu/useStopRefresh";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("stop auto refresh", () => {
  it("ticks locally, polls every 30 seconds, refreshes on return and cleans up", async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(async () => {});
    const start = Date.now();
    const { result, unmount } = renderHook(() => useStopRefresh(true, refresh));
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(result.current).toBe(start + 1000);
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(29_000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { window.dispatchEvent(new Event("focus")); });
    expect(refresh).toHaveBeenCalledTimes(2);
    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); window.dispatchEvent(new Event("focus")); });
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("skips hidden tabs and overlapping refreshes", async () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    let finish: () => void = () => {};
    const refresh = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderHook(() => useStopRefresh(true, refresh));
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(refresh).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
  });
});
