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
import GroupEdit from "../../Pages/Users/GroupEdit";
import RoleEdit from "../../Pages/Users/RoleEdit";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";
const { getMock, postMock, putMock, delMock, notifications } = vi.hoisted(
  () => ({
    getMock: vi.fn(),
    postMock: vi.fn(),
    putMock: vi.fn(),
    delMock: vi.fn(),
    notifications: { show: vi.fn() },
  }),
);
vi.mock("@toolpad/core", () => ({ useNotifications: () => notifications }));
vi.mock("../../Services/api", () => ({
  get: (...args: unknown[]) => getMock(...args),
  post: (...args: unknown[]) => postMock(...args),
  put: (...args: unknown[]) => putMock(...args),
  del: (...args: unknown[]) => delMock(...args),
  getFriendlyErrorMessage: (e: Error) => e.message,
  callApi: async (p: Promise<unknown>) => {
    try {
      return { ok: true, data: await p };
    } catch (error) {
      return { ok: false, error };
    }
  },
}));
const role = {
  id: 7,
  name: "Просмотр отчётов",
  role: "Reports",
  description: "Отчёты по торговым точкам",
  officeGroup: [],
};
function mount(kind: "Groups" | "Roles", create = false) {
  const store = configureStore({ reducer: { backButton, pageTitle } });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/${kind}/Edit/${create ? "new" : "42"}`]}>
        <Routes>
          <Route path="/Groups/Edit/:id" element={<GroupEdit />} />
          <Route path="/Roles/Edit/:id" element={<RoleEdit />} />
          <Route path="/Users" element={<p>Список пользователей</p>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}
beforeEach(() => {
  getMock
    .mockReset()
    .mockImplementation((url: string) =>
      Promise.resolve(
        url.includes("groups")
          ? {
              officeGroup: {
                id: 42,
                name: "Управляющие",
                officeRole: [],
                officeUser: [],
              },
              officeRoles: [role],
            }
          : url.endsWith("/roles")
            ? [role]
            : role,
      ),
    );
  postMock.mockReset().mockResolvedValue({});
  putMock.mockReset().mockResolvedValue({});
  delMock.mockReset().mockResolvedValue({});
});
describe("Access editors", () => {
  it("saves group name and selected role IDs through the shared form", async () => {
    mount("Groups");
    await screen.findByDisplayValue("Управляющие");
    fireEvent.click(await screen.findByRole("checkbox", { name: role.name }));
    fireEvent.submit(
      screen.getByRole("button", { name: "Сохранить" }).closest("form")!,
    );
    await waitFor(() =>
      expect(putMock).toHaveBeenCalledWith("/User/groups", {
        id: 42,
        name: "Управляющие",
        officeRole: [{ id: 7 }],
        officeUser: [],
      }),
    );
    expect(await screen.findByText("Список пользователей")).toBeVisible();
  });
  it("creates a group using the loaded role catalog", async () => {
    mount("Groups", true);
    await screen.findByRole("checkbox", { name: role.name });
    fireEvent.change(screen.getByLabelText("Название группы *"), {
      target: { value: "Новая группа" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: role.name }));
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(
        "/User/groups",
        expect.objectContaining({
          name: "Новая группа",
          officeRole: [{ id: 7 }],
        }),
      ),
    );
  });
  it("retains a multiline role description after a failed save", async () => {
    putMock.mockRejectedValueOnce(new Error("Ошибка сохранения"));
    mount("Roles");
    await screen.findByDisplayValue("Reports");
    fireEvent.change(screen.getByLabelText("Описание роли"), {
      target: { value: "Первая строка\nВторая строка" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ошибка сохранения",
    );
    expect(screen.getByLabelText("Описание роли")).toHaveValue(
      "Первая строка\nВторая строка",
    );
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(putMock).toHaveBeenLastCalledWith(
        "/User/roles",
        expect.objectContaining({
          role: "Reports",
          description: "Первая строка\nВторая строка",
        }),
      ),
    );
  });
  it("validates required role fields before creating", async () => {
    mount("Roles", true);
    await screen.findByRole("button", { name: "Создать" });
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));
    await screen.findByText("Код роли обязателен");
    expect(postMock).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Код роли *"), {
      target: { value: "Reports" },
    });
    fireEvent.change(screen.getByLabelText("Название роли *"), {
      target: { value: "Отчёты" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));
    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith(
        "/User/roles",
        expect.objectContaining({ role: "Reports", name: "Отчёты" }),
      ),
    );
  });
  it.each(["Groups", "Roles"] as const)(
    "offers retry after %s load failure",
    async (kind) => {
      getMock.mockRejectedValueOnce(new Error("Сервер недоступен"));
      mount(kind);
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Сервер недоступен",
      );
      expect(
        screen.queryByRole("button", { name: "Сохранить" }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        screen.getByRole("button", { name: "Повторить загрузку" }),
      );
      expect(
        await screen.findByRole("button", { name: "Сохранить" }),
      ).toBeVisible();
    },
  );
  it("shows group roles by section and keeps only one of mutually exclusive roles", async () => {
    const orders = [
      { id: 1, name: "Заказы ТТ Админ", role: "OrdersTTAdmin", description: "", officeGroup: [], section: "Заказы ТТ", exclusiveKey: "orders" },
      { id: 2, name: "Заказы - Все позиции", role: "Order_man", description: "", officeGroup: [], section: "Заказы ТТ", exclusiveKey: "orders" },
      { id: 3, name: "Заказы - Собственное управление", role: "Order_woman", description: "", officeGroup: [], section: "Заказы ТТ", exclusiveKey: "orders" },
    ];
    const reports = { ...role, section: "Отчёты" };
    getMock.mockImplementation(() => Promise.resolve({
      officeGroup: { id: 42, name: "Управляющие", officeRole: [orders[2]], officeUser: [] },
      officeRoles: [reports, ...orders],
    }));
    mount("Groups");

    const section = await screen.findByRole("group", { name: "Заказы ТТ" });
    expect(screen.getByRole("group", { name: "Отчёты" })).toBeInTheDocument();
    const choice = within(section).getByRole("group", { name: "Заказы ТТ: одна на выбор" });
    // повтор раздела в названии внутри раздела не показываем
    expect(within(choice).getByRole("checkbox", { name: "Собственное управление" })).toBeChecked();

    // выбор другой роли снимает прежнюю
    fireEvent.click(within(choice).getByRole("checkbox", { name: "Все позиции" }));
    expect(within(choice).getByRole("checkbox", { name: "Собственное управление" })).not.toBeChecked();
    expect(within(choice).getByRole("checkbox", { name: "Все позиции" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: role.name }));
    fireEvent.submit(screen.getByRole("button", { name: "Сохранить" }).closest("form")!);
    await waitFor(() => expect(putMock).toHaveBeenCalledWith("/User/groups", expect.objectContaining({ officeRole: [{ id: 7 }, { id: 2 }] })));
  });

  it("does not save a group that still has two mutually exclusive roles", async () => {
    const view = { id: 1, name: "Датчики - Просмотр данных", role: "SensorsView", description: "", officeGroup: [], section: "Датчики", exclusiveKey: "sensors" };
    const edit = { id: 2, name: "Датчики - Редактирование данных", role: "SensorsEdit", description: "", officeGroup: [], section: "Датчики", exclusiveKey: "sensors" };
    getMock.mockImplementation(() => Promise.resolve({
      officeGroup: { id: 42, name: "Администратор Датчиков", officeRole: [view, edit], officeUser: [] },
      officeRoles: [view, edit],
    }));
    mount("Groups");

    // осталось с тех пор, когда противоречия не проверялись
    expect(await screen.findByText("Выбраны сразу «Просмотр данных» и «Редактирование данных» — оставьте одну.")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Название группы *"), { target: { value: "Датчики" } });
    fireEvent.submit(screen.getByRole("button", { name: "Сохранить" }).closest("form")!);
    expect(await screen.findByText(/взаимоисключающие: в группе «Датчики» может быть только одна из них/)).toBeInTheDocument();
    expect(putMock).not.toHaveBeenCalled();

    // повторный клик снимает роль — сохранение проходит
    fireEvent.click(screen.getByRole("checkbox", { name: "Просмотр данных" }));
    expect(screen.queryByText(/Выбраны сразу/)).not.toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Сохранить" }).closest("form")!);
    await waitFor(() => expect(putMock).toHaveBeenCalledWith("/User/groups", expect.objectContaining({ officeRole: [{ id: 2 }] })));
  });

  describe("role section", () => {
    const mountRole = async () => {
      getMock.mockImplementation((url: string) => Promise.resolve(
        url.endsWith("/roles")
          ? [
              role,
              { ...role, id: 8, name: "Заказы ТТ Админ", section: "Заказы ТТ", exclusiveKey: "orders" },
              { ...role, id: 9, name: "Отчёты - 1С", section: "Отчёты", exclusiveKey: null },
            ]
          : role,
      ));
      mount("Roles");
      await screen.findByDisplayValue("Reports");
    };
    const pickSection = async (name: string) => {
      fireEvent.click(screen.getByRole("button", { name: "Раздел" }));
      fireEvent.click(within(await screen.findByRole("listbox")).getByRole("option", { name }));
    };
    const save = () => fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    it("takes the exclusive key from roles of the section", async () => {
      await mountRole();
      const exclusive = screen.getByRole("checkbox", { name: "Одна на выбор в разделе" });
      expect(exclusive).toBeDisabled();
      await pickSection("Заказы ТТ");
      fireEvent.click(exclusive);
      expect(screen.getByText("Не сочетается с: «Заказы ТТ Админ»")).toBeInTheDocument();
      save();
      await waitFor(() => expect(putMock).toHaveBeenCalledWith("/User/roles", expect.objectContaining({ section: "Заказы ТТ", exclusiveKey: "orders" })));
    });

    it("uses the section name as a key when the section has no exclusive roles yet", async () => {
      await mountRole();
      await pickSection("Отчёты");
      fireEvent.click(screen.getByRole("checkbox", { name: "Одна на выбор в разделе" }));
      save();
      await waitFor(() => expect(putMock).toHaveBeenCalledWith("/User/roles", expect.objectContaining({ section: "Отчёты", exclusiveKey: "отчёты" })));
    });

    it("lets type a new section", async () => {
      await mountRole();
      await pickSection("Новый раздел…");
      fireEvent.change(screen.getByLabelText("Новый раздел"), { target: { value: " Касса " } });
      save();
      await waitFor(() => expect(putMock).toHaveBeenCalledWith("/User/roles", expect.objectContaining({ section: "Касса", exclusiveKey: null })));
    });
  });

  it("requires confirmation before deleting a role", async () => {
    mount("Roles");
    await screen.findByDisplayValue("Reports");
    fireEvent.click(screen.getByRole("button", { name: "Удалить" }));
    expect(delMock).not.toHaveBeenCalled();
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(
      dialog.getByRole("button", { name: /Удалить|Подтвердить|Да/ }),
    );
    await waitFor(() => expect(delMock).toHaveBeenCalledWith("/User/roles/42"));
  });
});
