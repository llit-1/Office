import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MultiplySelect } from "../../Components/MultiplySelect/MultiplySelect";

const items = Array.from({ length: 250 }, (_, id) => ({
  id,
  name: `Пункт ${String(id).padStart(3, "0")}`,
}));
const keyOf = (item: (typeof items)[number]) => item.id;
const labelOf = (item: (typeof items)[number]) => item.name;

describe("MultiplySelect", () => {
  it("keeps saved selections first without moving tiles after selection changes", () => {
    function Picker() {
      const [keys, setKeys] = useState<Array<string | number>>([2]);
      return (
        <MultiplySelect
          items={items.slice(0, 4)}
          getKey={keyOf}
          getLabel={labelOf}
          selectedKeys={keys}
          onChange={setKeys}
        />
      );
    }
    render(<Picker />);
    const before = screen
      .getAllByRole("checkbox")
      .map((node) => node.closest("label")?.textContent);
    expect(before).toEqual([
      "Пункт 002",
      "Пункт 000",
      "Пункт 001",
      "Пункт 003",
    ]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Пункт 000" }));
    expect(screen.getByRole("checkbox", { name: "Пункт 000" })).toBeChecked();
    expect(
      screen
        .getAllByRole("checkbox")
        .map((node) => node.closest("label")?.textContent),
    ).toEqual(before);
    fireEvent.keyDown(screen.getByRole("checkbox", { name: "Пункт 000" }), {
      key: "Enter",
    });
    expect(
      screen.getByRole("checkbox", { name: "Пункт 000" }),
    ).not.toBeChecked();
  });

  it("loads more tiles and searches the whole list while preserving hidden selections", () => {
    const onChange = vi.fn();
    render(
      <MultiplySelect
        items={items}
        getKey={keyOf}
        getLabel={labelOf}
        selectedKeys={[0]}
        onChange={onChange}
        label="Поиск роли"
      />,
    );
    expect(screen.getAllByRole("checkbox")).toHaveLength(120);
    fireEvent.click(screen.getByRole("button", { name: "Показать ещё" }));
    expect(screen.getAllByRole("checkbox")).toHaveLength(240);
    fireEvent.change(screen.getByRole("searchbox", { name: "Поиск роли" }), {
      target: { value: "249" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Пункт 249" }));
    expect(onChange).toHaveBeenLastCalledWith([0, 249]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    expect(screen.getAllByRole("checkbox")).toHaveLength(120);
  });

  it("blocks changes when disabled and initializes selections after asynchronous loading", () => {
    const onChange = vi.fn();
    const props = { getKey: keyOf, getLabel: labelOf, onChange };
    const { rerender } = render(
      <MultiplySelect {...props} items={[]} selectedKeys={[]} loading />,
    );
    expect(screen.getByRole("searchbox")).toBeDisabled();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    rerender(
      <MultiplySelect
        {...props}
        items={items.slice(0, 3)}
        selectedKeys={[2]}
        disabled
      />,
    );
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    expect(screen.getAllByRole("checkbox")[0]).toBeDisabled();
    fireEvent.keyDown(screen.getAllByRole("checkbox")[0], { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
