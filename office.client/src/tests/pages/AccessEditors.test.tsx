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
