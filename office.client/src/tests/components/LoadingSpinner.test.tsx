import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";

describe("LoadingSpinner", () => {
  it("uses the compact 24px variant for small requested sizes", () => {
    const { container } = render(<LoadingSpinner size={34} />);
    const svg = container.querySelector("svg");

    expect(svg).toHaveStyle({ width: "24px", height: "24px" });
  });

  it("normalizes block and page sizes to the design-system scale", () => {
    const { container, rerender } = render(<LoadingSpinner size={64} />);
    expect(container.querySelector("svg")).toHaveStyle({ width: "56px", height: "56px" });

    rerender(<LoadingSpinner size={80} />);
    expect(container.querySelector("svg")).toHaveStyle({ width: "96px", height: "96px" });
  });

  it("changes its accessible label during a long load", () => {
    vi.useFakeTimers();
    render(<LoadingSpinner label="Загружаем…" />);

    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Загружаем…");
    act(() => vi.advanceTimersByTime(6000));
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Почти готово…");
    vi.useRealTimers();
  });

  it("exposes the exit transition state", () => {
    const { container } = render(<LoadingSpinner exiting />);
    expect(container.firstChild).toHaveAttribute("data-state", "exiting");
  });
});
