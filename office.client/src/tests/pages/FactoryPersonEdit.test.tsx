import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FactoryPersonEdit from "../../Pages/FactoryPerson/FactoryPersonEdit";
import backButtonReducer from "../../Store/stateForBackButtonSlice";
import pageTitleReducer from "../../Store/stateForPageTitleSlice";

const getMock = vi.fn();
const postMock = vi.fn();
const putMock = vi.fn();

vi.mock("../../Services/api", () => ({
  get: (...args: unknown[]) => getMock(...args),
  post: (...args: unknown[]) => postMock(...args),
  put: (...args: unknown[]) => putMock(...args),
  getFriendlyErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
  callApi: async (promise: Promise<unknown>) => {
    try {
      return { ok: true, data: await promise };
    } catch (error) {
      return { ok: false, error };
    }
  },
}));

function renderForm(id?: string) {
  const store = configureStore({
    reducer: {
      backButton: backButtonReducer,
      pageTitle: pageTitleReducer,
    },
  });

  render(
    <Provider store={store}>
      <MemoryRouter
        initialEntries={[
          id ? `/FactoryPerson/Edit/${id}` : "/FactoryPerson/Edit",
        ]}
      >
        <Routes>
          <Route path="/FactoryPerson/Edit" element={<FactoryPersonEdit />} />
          <Route
            path="/FactoryPerson/Edit/:id"
            element={<FactoryPersonEdit />}
          />
          <Route path="/FactoryPerson" element={<p>Список сотрудников</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

function getNativeSelect(label: string) {
  const wrapper = screen.getByText(label).parentElement;
  if (!wrapper) throw new Error(`Select wrapper not found: ${label}`);
  return within(wrapper).getByRole("combobox", {
    hidden: true,
  }) as HTMLSelectElement;
}

function openSelect(label: string) {
  const wrapper = screen.getByText(label).parentElement;
  const control = wrapper?.querySelector("div");
  if (!(control instanceof HTMLElement))
    throw new Error(`Select control not found: ${label}`);
  fireEvent.click(control);
}

function chooseVisibleOption(label: string) {
  const option = screen
    .getAllByRole("option", { name: label })
    .find((element) => element.tagName === "DIV");
  if (!(option instanceof HTMLElement))
    throw new Error(`Visible option not found: ${label}`);
  fireEvent.click(option);
}

describe("FactoryPersonEdit dependent selects", () => {
  beforeEach(() => {
    getMock.mockReset();
    getMock.mockImplementation((url: string) => {
      if (url === "/PersonalityFactory/addmodel") {
        return Promise.resolve({
          factoryDepartments: [{ id: 15, name: "Бухгалтерия" }],
          factoryCitizenshipTypes: [],
          factoryEntities: [],
          factoryDocumentTypes: [],
          factoryBanks: [],
          factorySKUDGroups: [],
        });
      }

      if (url === "/PersonalityFactory/workshops/15") {
        return Promise.resolve([{ id: 41, name: "Бухгалтерия" }]);
      }

      if (url === "/PersonalityFactory/jobtitles?department=15&workshop=41") {
        return Promise.resolve([
          { id: 132, name: "Бухгалтер" },
          { id: 133, name: "Бухгалтер по расчету заработной платы" },
          { id: 100, name: "Ведущий бухгалтер" },
          { id: 105, name: "Главный бухгалтер" },
          { id: 106, name: "Заместитель главного бухгалтера" },
        ]);
      }

      return Promise.resolve([]);
    });
  });

  it("does not submit a new employee without required fields", async () => {
    postMock.mockReset();
    renderForm();

    await screen.findByText("Отдел");
    fireEvent.click(screen.getByRole("button", { name: "Добавить" }));

    expect(await screen.findByText("Укажите фамилию.")).toBeTruthy();
    expect(screen.getByText("Выберите юр. лицо.")).toBeTruthy();
    expect(screen.getByText("Выберите тип документа.")).toBeTruthy();
    expect(screen.getByText("Выберите гражданство.")).toBeTruthy();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("loads job titles after department and workshop are selected", async () => {
    renderForm();

    await screen.findByText("Отдел");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    openSelect("Отдел");
    chooseVisibleOption("Бухгалтерия");

    await waitFor(() => {
      expect(getMock).toHaveBeenCalledWith("/PersonalityFactory/workshops/15");
    });

    openSelect("Участок");
    chooseVisibleOption("Бухгалтерия");

    await waitFor(() => {
      const jobTitleCalls = getMock.mock.calls.filter(
        ([url]) =>
          url === "/PersonalityFactory/jobtitles?department=15&workshop=41",
      );
      expect(jobTitleCalls).toHaveLength(1);
      const jobTitleSelect = getNativeSelect("Должность");
      expect(within(jobTitleSelect).getAllByRole("option")).toHaveLength(6);
      expect(jobTitleSelect).toHaveValue("");
    });

    openSelect("Должность");
    for (const jobTitle of [
      "Бухгалтер",
      "Бухгалтер по расчету заработной платы",
      "Ведущий бухгалтер",
      "Главный бухгалтер",
      "Заместитель главного бухгалтера",
    ]) {
      expect(
        screen
          .getAllByRole("option", { name: jobTitle })
          .some((element) => element.tagName === "DIV"),
      ).toBe(true);
    }
  });

  it("refreshes the custom job-title dropdown when an asynchronous response arrives", async () => {
    let resolveJobTitles!: (value: Array<{ id: number; name: string }>) => void;
    const pendingJobTitles = new Promise<Array<{ id: number; name: string }>>(
      (resolve) => {
        resolveJobTitles = resolve;
      },
    );

    getMock.mockImplementation((url: string) => {
      if (url === "/PersonalityFactory/addmodel") {
        return Promise.resolve({
          factoryDepartments: [{ id: 4, name: "Производство" }],
          factoryCitizenshipTypes: [],
          factoryEntities: [],
          factoryDocumentTypes: [],
          factoryBanks: [],
          factorySKUDGroups: [],
        });
      }
      if (url === "/PersonalityFactory/workshops/4") {
        return Promise.resolve([{ id: 18, name: "Варщики" }]);
      }
      if (url === "/PersonalityFactory/jobtitles?department=4&workshop=18") {
        return pendingJobTitles;
      }
      return Promise.resolve([]);
    });

    renderForm();
    await screen.findByText("Отдел");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    openSelect("Отдел");
    chooseVisibleOption("Производство");
    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith("/PersonalityFactory/workshops/4"),
    );

    openSelect("Участок");
    chooseVisibleOption("Варщики");
    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith(
        "/PersonalityFactory/jobtitles?department=4&workshop=18",
      ),
    );

    await act(async () => {
      resolveJobTitles([
        { id: 4, name: "варщик морсов" },
        { id: 1, name: "варщик начинок" },
      ]);
      await pendingJobTitles;
    });

    openSelect("Должность");
    expect(
      screen
        .getAllByRole("option", { name: "варщик морсов" })
        .some((item) => item.tagName === "DIV"),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("option", { name: "варщик начинок" })
        .some((item) => item.tagName === "DIV"),
    ).toBe(true);
  });

  it("accepts a data-wrapped job-title response", async () => {
    getMock.mockImplementation((url: string) => {
      if (url === "/PersonalityFactory/addmodel") {
        return Promise.resolve({
          factoryDepartments: [{ id: 4, name: "Производство" }],
          factoryCitizenshipTypes: [],
          factoryEntities: [],
          factoryDocumentTypes: [],
          factoryBanks: [],
          factorySKUDGroups: [],
        });
      }
      if (url === "/PersonalityFactory/workshops/4") {
        return Promise.resolve({ data: [{ id: 18, name: "Варщики" }] });
      }
      if (url === "/PersonalityFactory/jobtitles?department=4&workshop=18") {
        return Promise.resolve({ data: [{ id: 4, name: "варщик морсов" }] });
      }
      return Promise.resolve([]);
    });

    renderForm();
    await screen.findByText("Отдел");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    openSelect("Отдел");
    chooseVisibleOption("Производство");
    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith("/PersonalityFactory/workshops/4"),
    );
    openSelect("Участок");
    chooseVisibleOption("Варщики");
    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith(
        "/PersonalityFactory/jobtitles?department=4&workshop=18",
      ),
    );
    openSelect("Должность");
    expect(
      screen
        .getAllByRole("option", { name: "варщик морсов" })
        .some((item) => item.tagName === "DIV"),
    ).toBe(true);
  });
});

const editPerson = {
  id: 42,
  surname: "Иванов",
  name: "Иван",
  patronymic: "Иванович",
  birthdate: "1990-03-12T00:00:00",
  passport: "4010 123456",
  passportDate: "2010-04-20T00:00:00",
  factoryDepartment: 4,
  factoryWorkshop: 18,
  factoryJobTitle: 9,
  factoryCitizenship: 2,
  factoryEntity: 3,
  factoryDocumentType: 5,
  factoryBanks: 6,
  cardNumber: "2200123456789012",
  phone: "9123456789",
  hostelChekin: "2024-02-01T00:00:00",
  hostelCheckOut: null,
  hiringDate: "2024-01-20T00:00:00",
  dismissedDate: null,
  passCardNumber: "123456",
  skudGroupId: 7,
  photo: null,
  fake: true,
};

function getEditModel(isFactorySecurity = false) {
  return {
    factoryPerson: editPerson,
    factoryDepartments: [{ id: 4, name: "Производство" }],
    factoryWorkshops: [{ id: 18, name: "Варщики" }],
    factoryJobTitles: [{ id: 9, name: "Варщик" }],
    factoryCitizenshipTypes: [{ id: 1, name: "РФ" }],
    factoryCitizenships: [{ id: 2, name: "Россия", citizenshipTypeId: 1 }],
    factoryEntities: [{ id: 3, name: "Юридическое лицо" }],
    factoryDocumentTypes: [{ id: 5, name: "Паспорт РФ" }],
    factoryBanks: [{ id: 6, name: "Банк сотрудника" }],
    factorySKUDGroups: [{ id: 7, name: "Производство, дневная смена" }],
    isFactorySecurity,
  };
}

describe("FactoryPersonEdit editor workflow", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
    putMock.mockReset();
    getMock.mockImplementation((url: string) => {
      if (url === "/PersonalityFactory/persons/42")
        return Promise.resolve(getEditModel());
      if (url === "/PersonalityFactory/addmodel")
        return Promise.resolve(getEditModel());
      return Promise.resolve([]);
    });
    putMock.mockResolvedValue({});
    postMock.mockResolvedValue({});
  });

  it("retains values across tabs and preserves untouched edit-only data in the save request", async () => {
    renderForm("42");
    const surname = await screen.findByLabelText(/^Фамилия/);
    expect(surname).toHaveValue("Иванов");
    expect(screen.getByLabelText(/^Дата рождения/)).toHaveValue("1990-03-12");
    expect(getNativeSelect("Отдел")).toHaveValue("4");
    expect(getNativeSelect("Участок")).toHaveValue("18");
    expect(getNativeSelect("Должность")).toHaveValue("9");

    fireEvent.change(surname, { target: { value: "Петров" } });
    fireEvent.click(screen.getByRole("tab", { name: "Документы и реквизиты" }));
    expect(screen.getByLabelText(/^Паспорт/)).toBeVisible();
    expect(screen.getByLabelText(/^Дата выдачи паспорта/)).toHaveValue(
      "2010-04-20",
    );
    expect(screen.getByLabelText(/^Дата въезда/)).toHaveValue("2024-02-01");
    expect(screen.queryByText("Банк", { exact: true })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Паспорт/), {
      target: { value: "4012 654321" },
    });

    fireEvent.click(screen.getByRole("tab", { name: "Сотрудник" }));
    expect(screen.getByLabelText(/^Фамилия/)).toHaveValue("Петров");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() =>
      expect(putMock).toHaveBeenCalledWith(
        "/PersonalityFactory/persons",
        expect.objectContaining({
          id: 42,
          surname: "Петров",
          passport: "4012 654321",
          factoryDepartment: 4,
          factoryWorkshop: 18,
          factoryJobTitle: 9,
          factoryBanks: 6,
          cardNumber: "2200123456789012",
          birthdate: "1990-03-12",
          hostelChekin: "2024-02-01",
          hostelCheckOut: null,
          passCardNumber: "123456",
          photo: null,
          fake: true,
        }),
      ),
    );
    expect(await screen.findByText("Список сотрудников")).toBeInTheDocument();
  });

  it("keeps the security role's restricted fields and photo action unavailable across tabs", async () => {
    getMock.mockResolvedValue(getEditModel(true));
    renderForm("42");
    expect(await screen.findByLabelText(/^Фамилия/)).toBeDisabled();
    expect(screen.getByLabelText(/^Имя/)).toBeDisabled();
    expect(screen.getByLabelText(/^Отчество/)).toBeDisabled();
    expect(screen.getByLabelText(/^Номер пропуска/)).toBeDisabled();
    expect(screen.getByLabelText(/^Телефон/)).not.toBeDisabled();
    expect(screen.getByLabelText(/^Дата рождения/)).not.toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "С камеры" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Загрузить" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Документы и реквизиты" }));
    expect(screen.getByLabelText(/^Паспорт/)).toBeDisabled();
    expect(screen.getByLabelText(/^Номер банковской карты/)).toBeDisabled();
    expect(screen.getByLabelText(/^Дата выдачи паспорта/)).not.toBeDisabled();

    fireEvent.click(screen.getByRole("tab", { name: "Сотрудник" }));
    fireEvent.change(screen.getByLabelText(/^Телефон/), {
      target: { value: "9991234567" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(putMock).toHaveBeenCalledWith(
        "/PersonalityFactory/persons",
        expect.objectContaining({
          surname: "Иванов",
          name: "Иван",
          passport: "4010 123456",
          cardNumber: "2200123456789012",
          passCardNumber: "123456",
          phone: "9991234567",
        }),
      ),
    );
  });

  it("keeps edited data after a save failure and lets the user retry", async () => {
    putMock.mockRejectedValueOnce(new Error("Сохранение временно недоступно"));
    renderForm("42");
    fireEvent.change(await screen.findByLabelText(/^Фамилия/), {
      target: { value: "Петров" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    expect(
      await screen.findByText("Сохранение временно недоступно"),
    ).toBeVisible();
    expect(screen.queryByText("Список сотрудников")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Фамилия/)).toHaveValue("Петров");
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Список сотрудников")).toBeInTheDocument();
    expect(putMock).toHaveBeenCalledTimes(2);
  });

  it("shows the bank choice when adding an employee", async () => {
    renderForm();
    await screen.findByRole("tab", { name: "Документы и реквизиты" });
    fireEvent.click(screen.getByRole("tab", { name: "Документы и реквизиты" }));
    expect(getNativeSelect("Банк")).toBeInTheDocument();
  });

  it("recovers from an initial loading failure with retry", async () => {
    getMock.mockRejectedValueOnce(new Error("Не удалось загрузить сотрудника"));
    renderForm("42");
    expect(
      await screen.findByText("Не удалось загрузить сотрудника"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Повторить/ }));
    expect(await screen.findByLabelText(/^Фамилия/)).toHaveValue("Иванов");
    expect(getMock).toHaveBeenCalledTimes(2);
  });
});
