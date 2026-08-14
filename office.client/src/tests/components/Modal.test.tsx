import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Modal from "../../Components/Modal/Modal";

describe("Modal", () => {
  it("does not close on backdrop click by default", () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Проверка">Содержимое</Modal>);

    fireEvent.mouseDown(screen.getByRole("dialog"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("can explicitly close on backdrop click", () => {
    const onClose = vi.fn();
    render(
      <Modal isOpen onClose={onClose} title="Проверка" closeOnBackdropClick>
        Содержимое
      </Modal>,
    );

    fireEvent.mouseDown(screen.getByRole("dialog"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
