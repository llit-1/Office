import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import GenericTable, { type Column } from "../../Components/GenericTable/GenericTable";

interface PersonRow {
  id: number;
  lastName: string;
  firstName: string;
  middleName: string;
  role: string;
  city: string;
}

const columns: Column<PersonRow>[] = [
  { key: "lastName", label: "Last name" },
  { key: "firstName", label: "First name", responsivePriorityByViewport: { phone: 0, tablet: 0 } },
  { key: "middleName", label: "Middle name" },
  { key: "role", label: "Role", responsivePriorityByViewport: { phone: 1, tablet: 2 } },
  { key: "city", label: "City", responsivePriorityByViewport: { tablet: 1 } },
];

const data: PersonRow[] = [
  { id: 1, lastName: "Ivanov", firstName: "Ivan", middleName: "Ivanovich", role: "Manager", city: "Moscow" },
  { id: 2, lastName: "Petrov", firstName: "Petr", middleName: "Petrovich", role: "Analyst", city: "Kazan" },
  { id: 3, lastName: "Ivanov", firstName: "Sergey", middleName: "Andreevich", role: "Developer", city: "Sochi" },
];

function setViewport(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
  window.dispatchEvent(new Event("resize"));
}

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
    setViewport(1280);
  });

  it("filters rows by selected column values, hides zero-result options, and restores saved state", async () => {
    const user = userEvent.setup();
    const firstRender = renderTable();

    await user.click(screen.getByLabelText("Фильтр по столбцу Last name"));
    await user.click(screen.getByLabelText("Выделить все"));
    await user.click(screen.getByRole("checkbox", { name: /Ivanov/ }));
    await user.click(screen.getByLabelText("Фильтр по столбцу First name"));

    expect(screen.queryByRole("checkbox", { name: /Petr/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Готово" }));

    expect(screen.getAllByText("Ivanov")).toHaveLength(2);
    expect(screen.queryByText("Petrov")).not.toBeInTheDocument();

    firstRender.unmount();
    renderTable();

    expect(screen.getAllByText("Ivanov")).toHaveLength(2);
    expect(screen.queryByText("Petrov")).not.toBeInTheDocument();
  });

  it("persists selected visible columns", async () => {
    const user = userEvent.setup();
    const firstRender = renderTable();

    await user.click(screen.getByRole("button", { name: "Настройка колонок" }));
    await user.click(screen.getByRole("checkbox", { name: "First name" }));
    await user.click(screen.getByRole("button", { name: "Готово" }));

    expect(screen.queryByRole("columnheader", { name: /First name/ })).not.toBeInTheDocument();

    firstRender.unmount();
    renderTable();

    expect(screen.queryByRole("columnheader", { name: /First name/ })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Last name/ })).toBeInTheDocument();
  });

  it("shows only two columns by default on phones", () => {
    setViewport(560);

    renderTable();

    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getByRole("columnheader", { name: /First name/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Role/ })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Last name/ })).not.toBeInTheDocument();
  });

  it("shows only four columns by default on tablets", () => {
    setViewport(900);

    renderTable();

    expect(screen.getAllByRole("columnheader")).toHaveLength(4);
    expect(screen.getByRole("columnheader", { name: /City/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Role/ })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /Middle name/ })).not.toBeInTheDocument();
  });

  it("does not reuse desktop column settings on phones", () => {
    localStorage.setItem(
      "genericTable:generic-table-test:desktop",
      JSON.stringify({
        sortColumnId: "lastName",
        sortOrder: "asc",
        orderedColumnIds: ["lastName", "firstName", "middleName", "role", "city"],
        visibleColumnIds: ["lastName", "firstName", "middleName", "role", "city"],
        visibleColumnMode: "custom",
        rowDensity: "normal",
        filters: {},
      }),
    );
    setViewport(560);

    renderTable();

    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.queryByRole("columnheader", { name: /Last name/ })).not.toBeInTheDocument();
  });
});
