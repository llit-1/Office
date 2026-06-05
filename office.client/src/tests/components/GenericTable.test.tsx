import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import GenericTable, { type Column } from "../../Components/GenericTable/GenericTable";

interface PersonRow {
  id: number;
  surname: string;
  name: string;
}

const columns: Column<PersonRow>[] = [
  { key: "surname", label: "Фамилия" },
  { key: "name", label: "Имя" },
];

const data: PersonRow[] = [
  { id: 1, surname: "Иванов", name: "Иван" },
  { id: 2, surname: "Петров", name: "Петр" },
  { id: 3, surname: "Иванов", name: "Сергей" },
];

function renderTable() {
  return render(
    <MemoryRouter initialEntries={["/FactoryPerson"]}>
      <GenericTable<PersonRow>
        columns={columns}
        data={data}
        loading={false}
        addOption={false}
        tableStateKey="generic-table-test"
      />
    </MemoryRouter>,
  );
}

describe("GenericTable", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("filters rows by selected column values, hides zero-result options, and restores saved state", async () => {
    const user = userEvent.setup();
    const firstRender = renderTable();

    await user.click(screen.getByLabelText("Фильтр по столбцу Фамилия"));
    await user.click(screen.getByLabelText("Выделить все"));
    await user.click(screen.getByRole("checkbox", { name: /Иванов/ }));
    await user.click(screen.getByLabelText("Фильтр по столбцу Имя"));

    expect(screen.queryByRole("checkbox", { name: /Петр/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Готово" }));

    expect(screen.getAllByText("Иванов")).toHaveLength(2);
    expect(screen.queryByText("Петров")).not.toBeInTheDocument();

    firstRender.unmount();
    renderTable();

    expect(screen.getAllByText("Иванов")).toHaveLength(2);
    expect(screen.queryByText("Петров")).not.toBeInTheDocument();
  });

  it("persists selected visible columns", async () => {
    const user = userEvent.setup();
    const firstRender = renderTable();

    await user.click(screen.getByRole("button", { name: "Настройка колонок" }));
    await user.click(screen.getByRole("checkbox", { name: "Имя" }));
    await user.click(screen.getByRole("button", { name: "Готово" }));

    expect(screen.queryByRole("columnheader", { name: /Имя/ })).not.toBeInTheDocument();

    firstRender.unmount();
    renderTable();

    expect(screen.queryByRole("columnheader", { name: /Имя/ })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Фамилия/ })).toBeInTheDocument();
  });
});
