import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import GenericTable, { computePopupPosition, type Column } from "../../Components/GenericTable/GenericTable";

const excelMocks = vi.hoisted(() => {
  const toFile = vi.fn().mockResolvedValue(undefined);
  const writeXlsxFile = vi.fn((..._args: unknown[]) => ({ toFile }));
  return { toFile, writeXlsxFile };
});

vi.mock("write-excel-file/browser", () => ({
  default: excelMocks.writeXlsxFile,
}));

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

function renderTable(routeTo?: string) {
  return render(
    <MemoryRouter initialEntries={["/FactoryPerson"]}>
      <GenericTable<PersonRow>
        columns={columns}
        data={data}
        loading={false}
        addOption={false}
        routeTo={routeTo}
        tableStateKey="generic-table-test"
      />
    </MemoryRouter>,
  );
}

describe("GenericTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setViewport(1280);
  });

  it("ограничивает открытое вверх меню пространством над кнопкой", () => {
    const anchorRect = {
      left: 1528,
      right: 1578,
      top: 758,
      bottom: 808,
      width: 50,
      height: 50,
      x: 1528,
      y: 758,
      toJSON: () => ({}),
    } as DOMRect;

    const position = computePopupPosition(anchorRect, 280, 550, 1670, 836, true);

    expect(position.top).toBe(200);
    expect(position.maxHeight).toBe(742);
    expect(position.top + 550).toBeLessThanOrEqual(anchorRect.top - 8);
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

  it("creates and applies multiple named presets for the table", async () => {
    const user = userEvent.setup();
    const firstRender = renderTable();

    await user.click(screen.getByRole("button", { name: "Настройка колонок" }));
    await user.click(screen.getByRole("checkbox", { name: "First name" }));
    await user.click(screen.getByRole("button", { name: "Создать пресет" }));
    await user.type(screen.getByRole("textbox", { name: "Название нового пресета" }), "Краткий");
    await user.click(screen.getByRole("button", { name: "Создать" }));

    await user.click(screen.getByRole("checkbox", { name: "First name" }));
    await user.click(screen.getByRole("checkbox", { name: "Middle name" }));
    await user.click(screen.getByRole("button", { name: "Создать пресет" }));
    await user.type(screen.getByRole("textbox", { name: "Название нового пресета" }), "Рабочий");
    await user.click(screen.getByRole("button", { name: "Создать" }));

    await user.selectOptions(screen.getByRole("combobox", { name: "Пресет настроек таблицы" }), "Краткий");

    expect(screen.queryByRole("columnheader", { name: /First name/ })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Middle name/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Пресет настроек таблицы" }), "");

    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
    expect(screen.getByRole("columnheader", { name: /First name/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Middle name/ })).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Пресет настроек таблицы" }), "Краткий");

    const storedPresets = JSON.parse(
      localStorage.getItem("genericTable:generic-table-test:desktop:presets") ?? "{}",
    );
    expect(storedPresets.presets).toHaveLength(2);
    expect(storedPresets.presets[0].state).not.toHaveProperty("filters");

    await user.click(screen.getByRole("button", { name: "Готово" }));
    firstRender.unmount();
    renderTable();

    expect(screen.queryByRole("columnheader", { name: /First name/ })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Middle name/ })).toBeInTheDocument();
  });

  it("exports only filtered rows and visible columns to an xlsx file", async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByLabelText("Фильтр по столбцу Last name"));
    await user.click(screen.getByLabelText("Выделить все"));
    await user.click(screen.getByRole("checkbox", { name: /Ivanov/ }));
    await user.click(screen.getByRole("button", { name: "Готово" }));

    await user.click(screen.getByRole("button", { name: "Настройка колонок" }));
    await user.click(screen.getByRole("checkbox", { name: "First name" }));
    await user.click(screen.getByRole("button", { name: "Готово" }));
    await user.click(screen.getByRole("button", { name: "Экспортировать таблицу в Excel" }));

    await waitFor(() => expect(excelMocks.writeXlsxFile).toHaveBeenCalledTimes(1));

    const [sheetData, sheetOptions, exportOptions] = excelMocks.writeXlsxFile.mock.calls[0] as [
      Array<Array<{ value: unknown }>>,
      Record<string, unknown>,
      {
        features: Array<{
          files?: {
            transform?: Record<string, { transform?: (xml: string) => string }>;
          };
        }>;
      },
    ];
    expect(sheetData).toHaveLength(3);
    expect(sheetData[0].map((cell: { value: unknown }) => cell.value)).toEqual([
      "Last name",
      "Middle name",
      "Role",
      "City",
    ]);
    expect(sheetData.slice(1).map((row: Array<{ value: unknown }>) => row[0].value)).toEqual([
      "Ivanov",
      "Ivanov",
    ]);
    expect(sheetOptions).toMatchObject({ sheet: "Данные", stickyRowsCount: 1 });
    const transformSheetXml =
      exportOptions.features[0].files?.transform?.["xl/worksheets/sheet{id}.xml"].transform;
    expect(transformSheetXml).toBeTypeOf("function");
    expect(transformSheetXml?.("<worksheet><sheetData/></worksheet>")).toContain(
      '<autoFilter ref="A1:D3"/>',
    );
    expect(excelMocks.toFile).toHaveBeenCalledWith(
      expect.stringMatching(/^generic-table-test-\d{4}-\d{2}-\d{2}\.xlsx$/),
    );
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

  it("opens a routed row in a new tab on middle click", () => {
    renderTable("/FactoryPerson/Edit");

    const rowLink = screen.getByRole("link", { name: "Petrov" });
    expect(rowLink).toHaveAttribute("href", "/FactoryPerson/Edit/2");
  });
});
