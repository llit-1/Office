import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import useRfidScanner from "../../Pages/Stock/useRfidScanner";

function Harness({ enabled, onScan }: { enabled: boolean; onScan: (code: string) => void }) {
  useRfidScanner(enabled, onScan);
  return <input aria-label="Комментарий" />;
}

function scan(target: EventTarget, text: string) {
  for (const key of [...Array.from(text), "Enter"]) {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }
}

it("collects a 24-symbol scan typed in Russian layout", () => {
  const onScan = vi.fn();
  render(<Harness enabled onScan={onScan} />);

  scan(window, "ФИСВУА000000000000000001");

  expect(onScan).toHaveBeenCalledWith("ABCDEF000000000000000001");
});

it("ignores typing inside fields, incomplete codes and disabled scanner", () => {
  const onScan = vi.fn();
  const { rerender } = render(<Harness enabled onScan={onScan} />);

  scan(screen.getByLabelText("Комментарий"), "E28011700000020F1A2B3C4D");
  scan(window, "E28011");
  rerender(<Harness enabled={false} onScan={onScan} />);
  scan(window, "E28011700000020F1A2B3C4D");

  expect(onScan).not.toHaveBeenCalled();
});
