import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FactoryPersonEdit from "../../Pages/FactoryPerson/FactoryPersonEdit";
import backButtonReducer from "../../Store/stateForBackButtonSlice";
import pageTitleReducer from "../../Store/stateForPageTitleSlice";

const getMock = vi.fn();

vi.mock("../../Services/api", () => ({
  get: (...args: unknown[]) => getMock(...args),
  post: vi.fn(),
  put: vi.fn(),
  callApi: async (promise: Promise<unknown>) => {
    try {
      return { ok: true, data: await promise };
    } catch (error) {
      return { ok: false, error };
    }
  },
}));

function renderForm() {
  const store = configureStore({
    reducer: {
      backButton: backButtonReducer,
      pageTitle: pageTitleReducer,
    },
  });

  render(
    <Provider store={store}>
      <MemoryRouter>
        <FactoryPersonEdit />
      </MemoryRouter>
    </Provider>,
  );
}

function getNativeSelect(label: string) {
  const wrapper = screen.getByText(label).parentElement;
  if (!wrapper) throw new Error(`Select wrapper not found: ${label}`);
  return within(wrapper).getByRole("combobox", { hidden: true }) as HTMLSelectElement;
}

function openSelect(label: string) {
  const wrapper = screen.getByText(label).parentElement;
  const control = wrapper?.querySelector("div");
  if (!(control instanceof HTMLElement)) throw new Error(`Select control not found: ${label}`);
  fireEvent.click(control);
}

function chooseVisibleOption(label: string) {
  const option = screen
    .getAllByRole("option", { name: label })
    .find((element) => element.tagName === "DIV");
  if (!(option instanceof HTMLElement)) throw new Error(`Visible option not found: ${label}`);
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
        ([url]) => url === "/PersonalityFactory/jobtitles?department=15&workshop=41",
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
        screen.getAllByRole("option", { name: jobTitle }).some((element) => element.tagName === "DIV"),
      ).toBe(true);
    }
  });

  it("refreshes the custom job-title dropdown when an asynchronous response arrives", async () => {
    let resolveJobTitles!: (value: Array<{ id: number; name: string }>) => void;
    const pendingJobTitles = new Promise<Array<{ id: number; name: string }>>((resolve) => {
      resolveJobTitles = resolve;
    });

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
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    openSelect("Отдел");
    chooseVisibleOption("Производство");
    await waitFor(() => expect(getMock).toHaveBeenCalledWith("/PersonalityFactory/workshops/4"));

    openSelect("Участок");
    chooseVisibleOption("Варщики");
    await waitFor(() => expect(getMock).toHaveBeenCalledWith("/PersonalityFactory/jobtitles?department=4&workshop=18"));

    await act(async () => {
      resolveJobTitles([
        { id: 4, name: "варщик морсов" },
        { id: 1, name: "варщик начинок" },
      ]);
      await pendingJobTitles;
    });

    openSelect("Должность");
    expect(screen.getAllByRole("option", { name: "варщик морсов" }).some((item) => item.tagName === "DIV")).toBe(true);
    expect(screen.getAllByRole("option", { name: "варщик начинок" }).some((item) => item.tagName === "DIV")).toBe(true);
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
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    openSelect("Отдел");
    chooseVisibleOption("Производство");
    await waitFor(() => expect(getMock).toHaveBeenCalledWith("/PersonalityFactory/workshops/4"));
    openSelect("Участок");
    chooseVisibleOption("Варщики");
    await waitFor(() => expect(getMock).toHaveBeenCalledWith("/PersonalityFactory/jobtitles?department=4&workshop=18"));
    openSelect("Должность");
    expect(screen.getAllByRole("option", { name: "варщик морсов" }).some((item) => item.tagName === "DIV")).toBe(true);
  });
});
