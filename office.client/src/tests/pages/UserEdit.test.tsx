import {
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
import UserEdit from "../../Pages/Users/UserEdit";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";

const { getMock, putMock, postMock, notifications } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  postMock: vi.fn(),
  notifications: { show: vi.fn() },
}));
vi.mock("@toolpad/core", () => ({ useNotifications: () => notifications }));
vi.mock("../../Services/api", () => ({
  get: (...args: unknown[]) => getMock(...args),
  put: (...args: unknown[]) => putMock(...args),
  post: (...args: unknown[]) => postMock(...args),
  getFriendlyErrorMessage: (error: Error) => error.message,
  callApi: async (promise: Promise<unknown>) => {
    try {
      return { ok: true, data: await promise };
    } catch (error) {
      return { ok: false, error };
    }
  },
}));

const groups = [
  { id: 1, name: "Управляющие", officeRole: [], officeUser: [] },
  { id: 2, name: "Бухгалтерия", officeRole: [], officeUser: [] },
];
const locations = [
  { guid: "tt-1", name: "Невский 10" },
  { guid: "tt-2", name: "Литейный 20" },
];
const model = {
  officeUser: {
    id: 42,
    login: "ivanova",
    surname: "Иванова",
    name: "Анна",
    patronymic: "Ивановна",
    position: "Руководитель",
    actual: 1,
    factoryPersonId: 17,
    personalitiesGuid: null,
    factoryPerson: null,
    personality: null,
    defaultLocations: 1,
    officeGroup: [groups[0]],
    locations: [],
  },
  locations,
  officeGroups: groups,
  reportLinks: { profit: "https://app.powerbi.com/view?r=old", profitPro: null },
  officeBids: [
    {
      id: 7,
      dateTime: "2026-09-11T08:30:00",
      comment: "Нужен доступ к отчётам",
    },
  ],
};
function renderEditor() {
  const store = configureStore({ reducer: { backButton, pageTitle } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/Users/Edit/42"]}>
        <Routes>
          <Route path="/Users/Edit/:id" element={<UserEdit />} />
          <Route path="/Users" element={<p>Список пользователей</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}
function chooseBinding(value: string) {
  const select = screen
    .getByText("Тип привязки ТТ")
    .parentElement!.querySelector("select")!;
  fireEvent.change(select, { target: { value } });
}

describe("UserEdit", () => {
  beforeEach(() => {
    getMock.mockReset().mockResolvedValue(structuredClone(model));
    putMock.mockReset().mockResolvedValue({});
    postMock.mockReset().mockResolvedValue({});
  });

  it("keeps manual mode empty until locations are selected and saves their GUIDs", async () => {
    renderEditor();
    await screen.findByDisplayValue("ivanova");
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    chooseBinding("manualTT");
    expect(
      screen.getByRole("searchbox", { name: "Поиск торговой точки" }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Выберите хотя бы одну",
    );
    expect(putMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Невский 10" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(putMock).toHaveBeenCalledWith(
        "/User/users",
        expect.objectContaining({
          locations: ["tt-1"],
          defaultLocations: 0,
          position: "Руководитель",
          factoryPersonId: 17,
        }),
      ),
    );
    expect(await screen.findByText("Список пользователей")).toBeVisible();
  });

  it("preserves group selection and edited fields through filtering and tabs", async () => {
    renderEditor();
    await screen.findByDisplayValue("ivanova");
    fireEvent.change(screen.getByRole("searchbox", { name: "Поиск группы" }), {
      target: { value: "Бухгалтерия" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Бухгалтерия" }));
    fireEvent.change(screen.getByLabelText("Имя *"), {
      target: { value: "Екатерина" },
    });
    fireEvent.click(screen.getByRole("tab", { name: /Заявки/ }));
    fireEvent.keyDown(screen.getByRole("tab", { name: /Заявки/ }), {
      key: "Home",
    });
    expect(screen.getByRole("tab", { name: "Доступ" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("checkbox", { name: "Бухгалтерия" })).toBeChecked();
    expect(screen.getByLabelText("Имя *")).toHaveValue("Екатерина");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(putMock).toHaveBeenCalledWith(
        "/User/users",
        expect.objectContaining({
          name: "Екатерина",
          officeGroup: [1, 2],
          defaultLocations: 1,
          locations: [],
        }),
      ),
    );
  });

  it("saves activity and disabled TT binding as zero without changing employee links", async () => {
    renderEditor();
    await screen.findByDisplayValue("ivanova");
    fireEvent.click(screen.getByRole("checkbox", { name: "Привязка ТТ" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Активность" }));
    expect(screen.getByText("Связи с сотрудником")).toBeVisible();
    expect(screen.getByText("Привязан", { exact: true })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(putMock).toHaveBeenCalledWith(
        "/User/users",
        expect.objectContaining({
          actual: 0,
          defaultLocations: 0,
          locations: [],
          factoryPersonId: 17,
          personalitiesGuid: null,
        }),
      ),
    );
  });

  it("keeps edits on save failure and submits on Enter through the form", async () => {
    putMock.mockRejectedValueOnce(new Error("Ошибка сохранения"));
    renderEditor();
    await screen.findByDisplayValue("ivanova");
    fireEvent.change(screen.getByLabelText("Фамилия *"), {
      target: { value: "Петрова" },
    });
    fireEvent.submit(
      screen.getByRole("button", { name: "Сохранить" }).closest("form")!,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ошибка сохранения",
    );
    expect(screen.getByLabelText("Фамилия *")).toHaveValue("Петрова");
    expect(screen.queryByText("Список пользователей")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByText("Список пользователей")).toBeVisible();
  });

  it("shows a retry state instead of an empty editable form after loading fails", async () => {
    getMock.mockRejectedValueOnce(new Error("Сервер недоступен"));
    renderEditor();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Сервер недоступен",
    );
    expect(
      screen.queryByRole("button", { name: "Сохранить" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    expect(await screen.findByDisplayValue("ivanova")).toBeVisible();
  });

  it("closes a bid only after a successful response and retains unsaved form data", async () => {
    postMock.mockRejectedValueOnce(new Error("Не удалось закрыть заявку"));
    renderEditor();
    await screen.findByDisplayValue("ivanova");
    fireEvent.change(screen.getByLabelText("Имя *"), {
      target: { value: "Екатерина" },
    });
    fireEvent.click(screen.getByRole("tab", { name: /Заявки/ }));
    fireEvent.click(screen.getByRole("button", { name: /Заявка № 7/ }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Нужен доступ к отчётам")).toBeVisible();
    fireEvent.click(dialog.getByRole("button", { name: "Закрыть заявку" }));
    expect(await dialog.findByRole("alert")).toHaveTextContent(
      "Не удалось закрыть заявку",
    );
    fireEvent.click(dialog.getByRole("button", { name: "Закрыть заявку" }));
    expect(await screen.findByText("Активных заявок нет")).toBeVisible();
    expect(postMock).toHaveBeenLastCalledWith("/User/users/bids/7/close");
    expect(screen.getByLabelText("Имя *")).toHaveValue("Екатерина");
    expect(screen.getByText("Есть несохранённые изменения")).toBeVisible();
  });

  it("edits personal revenue report links in their own tab and saves them with the user", async () => {
    renderEditor();
    await screen.findByDisplayValue("ivanova");
    const reportsTab = screen.getByRole("tab", { name: /Отчёты выручки/ });
    expect(reportsTab).toHaveTextContent("1");
    fireEvent.click(reportsTab);
    const section = within(
      screen.getByRole("tabpanel", { name: /Отчёты выручки/ }),
    );
    expect(section.getByLabelText("Выручка")).toHaveValue(
      "https://app.powerbi.com/view?r=old",
    );

    fireEvent.change(section.getByLabelText("Выручка Pro"), {
      target: { value: "http://powerbi.test/pro" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await section.findByRole("alert")).toHaveTextContent("https://");
    expect(putMock).not.toHaveBeenCalled();

    fireEvent.change(section.getByLabelText("Выручка Pro"), {
      target: { value: "https://powerbi.test/pro" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(putMock).toHaveBeenCalledWith(
        "/User/users",
        expect.objectContaining({
          reportLinks: {
            profit: "https://app.powerbi.com/view?r=old",
            profitPro: "https://powerbi.test/pro",
          },
        }),
      ),
    );
  });
});
