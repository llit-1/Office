import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Input from "../../Components/Input/Input";
import Select from "../../Components/Select/Select";
import Textarea from "../../Components/Textarea/Textarea";

describe("outlined form fields", () => {
  it("keeps a single accessible label while the decorative notch mirrors its width", () => {
    const { container } = render(<Input label="Фамилия" />);

    expect(screen.getByLabelText("Фамилия")).toBeInTheDocument();
    expect(screen.getAllByText("Фамилия")).toHaveLength(1);
    expect(container.querySelector("legend")).toHaveAttribute("data-label", "Фамилия");
  });

  it("uses the same accessible shell for select and textarea", () => {
    render(
      <>
        <Select label="Подразделение" options={[{ value: "1", label: "Отдел продаж" }]} />
        <Textarea label="Комментарий" />
      </>,
    );

    expect(screen.getByRole("button", { name: "Подразделение" })).toBeInTheDocument();
    expect(screen.getByLabelText("Комментарий")).toBeInstanceOf(HTMLTextAreaElement);
  });
  it("opens a portaled select upward without retaining its default top position", () => {
    render(
      <Select
        label="Location"
        search
        options={Array.from({ length: 10 }, (_, index) => ({
          value: String(index),
          label: `Location ${index}`,
        }))}
      />,
    );

    const control = screen.getByRole("button", { name: "Location" });
    const top = window.innerHeight - 70;
    vi.spyOn(control, "getBoundingClientRect").mockReturnValue({
      x: 20,
      y: top,
      top,
      left: 20,
      right: 320,
      bottom: top + 48,
      width: 300,
      height: 48,
      toJSON: () => ({}),
    });

    fireEvent.click(control);

    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveStyle({
      position: "fixed",
      top: "auto",
      bottom: "76px",
      maxHeight: "260px",
    });
    expect(listbox.parentElement).toBe(document.body);
  });
});
