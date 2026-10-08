import { configureStore } from "@reduxjs/toolkit";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import DeliveryPage from "../../Pages/DeliveryMenu/DeliveryPage";
import CashPage from "../../Pages/DeliveryMenu/CashPage";
import CashMessagesPage from "../../Pages/DeliveryMenu/CashMessagesPage";
import LegacyMenuRedirect from "../../Pages/DeliveryMenu/LegacyMenuRedirect";
import RequireRole from "../../App/RequireRole";
import { deliveryRequestRoles, deliveryMenuRoles, cashRoles } from "../../Pages/DeliveryMenu/sectionRoles";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";
import userData from "../../Store/userDataSlice";
import auth from "../../Store/authSlice";
import type { StopPack } from "../../Pages/DeliveryMenu/deliveryMenu.types";

const api = vi.hoisted(() => ({
  getCashLocations: vi.fn(),
  sendCashMessage: vi.fn(),
  getCashVersions: vi.fn(async () => []),
  getCashClients: vi.fn(async () => []),
  getCashTasks: vi.fn(async () => []),
}));
vi.mock("../../Pages/DeliveryMenu/cash.api", () => api);
const menuApi = vi.hoisted(() => ({
  getDeliveryGroups: vi.fn(async () => [{ id: 10, yaName: "Пицца", actual: 1, image: "" }]),
  getStopLocations: vi.fn(async () => []),
  getStopPacks: vi.fn(async (): Promise<StopPack[]> => []),
  getActualDeclarations: vi.fn(async () => []),
  // Экран категорий читает позиции всех категорий (бейджи стопов и деклараций) — без мока это был бы сетевой запрос.
  getDeliveryGroupItems: vi.fn(async () => []),
  getStopItems: vi.fn(async () => []),
}));
vi.mock("../../Pages/DeliveryMenu/deliveryMenu.api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../Pages/DeliveryMenu/deliveryMenu.api")>(),
  ...menuApi,
}));
vi.mock("../../Pages/DeliveryMenu/deliveryRequests.api", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../Pages/DeliveryMenu/deliveryRequests.api")>(),
  getRequestLocations: vi.fn(async () => []),
}));
const show = vi.hoisted(() => vi.fn());
vi.mock("@toolpad/core", () => ({ useNotifications: () => ({ show }) }));

function renderPage(element: ReactElement, roles: string[], path = "/") {
  const store = configureStore({ reducer: { backButton, pageTitle, userData, auth }, preloadedState: {
    userData: { loaded: true, roles, activeNotifications: [], newNotifications: [] },
    auth: { token: "test", id: 1, initialized: true, fullName: null, position: null },
  } });
  return render(<Provider store={store}><MemoryRouter initialEntries={[path]}>{element}</MemoryRouter></Provider>);
}

describe("Delivery and Cash access", () => {
  it.each([
    [["MenuMarketing"], true, false],
    [["DeliveryRequests"], false, true],
    [["MenuAdmin"], true, true],
  ] as [string[], boolean, boolean][])("shows delivery tabs and loads the first available page for %j", async (roles, menu, requests) => {
    renderPage(<DeliveryPage />, roles, "/Delivery");
    expect(Boolean(screen.queryByText("Меню доставки", { exact: true }))).toBe(menu);
    expect(Boolean(screen.queryByText("Запросы", { exact: true }))).toBe(requests);
    if (menu) expect(await screen.findByText("Пицца")).toBeInTheDocument();
    else expect(await screen.findByText("Выберите торговую точку")).toBeInTheDocument();
  });

  it.each([[["Menu"], 1], [["Menu", "MenuAuditor"], 3], [["Menu", "MenuMarketing"], 1]] as [string[], number][])("shows cash tabs and loads quick stops for %j", async (roles, count) => {
    renderPage(<CashPage />, roles, "/Cash");
    const firstTab = screen.getByText("Стопы (Яндекс)", { exact: true });
    expect(firstTab.parentElement?.children).toHaveLength(count);
    expect(await screen.findByText("Пицца")).toBeInTheDocument();
    expect(screen.queryByText("Новая категория")).not.toBeInTheDocument();
  });

  it.each([[["MenuAuditor"], 2], [["MenuAuditor", "CashUpdate"], 3]] as [string[], number][])("does not give the auditor quick stops and opens the audit stop list for %j", async (roles, count) => {
    menuApi.getDeliveryGroups.mockClear();
    renderPage(<CashPage />, roles, "/Cash");
    expect(screen.queryByText("Стопы (Яндекс)", { exact: true })).not.toBeInTheDocument();
    const firstTab = screen.getByText("Стопы (Аудит)", { exact: true });
    expect(firstTab.parentElement?.children).toHaveLength(count);
    expect(await screen.findByText("Стоп-лист пока пуст")).toBeInTheDocument();
    expect(menuApi.getDeliveryGroups).not.toHaveBeenCalled();
  });

  it("gives the update-only role just the update tab and moves it off unavailable tabs", async () => {
    menuApi.getDeliveryGroups.mockClear();
    renderPage(<Routes><Route path="/Cash/*" element={<CashPage />} /></Routes>, ["CashUpdate"], "/Cash/items");
    expect(await screen.findByText("Обновление", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Стопы (Аудит)", { exact: true })).not.toBeInTheDocument();
    await waitFor(() => expect(api.getCashVersions).toHaveBeenCalled());
    expect(menuApi.getDeliveryGroups).not.toHaveBeenCalled();
  });

  it("hides the update tab from an auditor without the update role", () => {
    renderPage(<CashPage />, ["MenuAuditor"], "/Cash");
    expect(screen.queryByText("Обновление", { exact: true })).not.toBeInTheDocument();
  });

  it("keeps navigation visible when changing the cash tab", async () => {
    renderPage(<CashPage />, ["Menu", "MenuAuditor"], "/Cash");
    await screen.findByText("Пицца");
    fireEvent.click(screen.getByText("Стопы (Аудит)", { exact: true }));
    expect(await screen.findByText("Стоп-лист пока пуст")).toBeInTheDocument();
    expect(screen.getByText("Стопы (Яндекс)", { exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Пицца")).not.toBeInTheDocument();
  });

  it("opens an explicit cash tab directly", async () => {
    renderPage(<CashPage />, ["MenuAuditor"], "/Cash/stops");
    expect(await screen.findByText("Стоп-лист пока пуст")).toBeInTheDocument();
    expect(screen.getByText("Стопы (Аудит)", { exact: true }).className).toContain("active");
  });

  it("updates scheduled and expired global stops on return without clearing the page", async () => {
    const start = Date.now();
    const begin = new Date(start + 10_000).toISOString();
    const end = new Date(start + 20_000).toISOString();
    menuApi.getStopPacks.mockResolvedValue([{ id: 1, itemId: 101, itemName: "Тестовый стоп", locationGUID: null, locationName: null,
      begin, end, permissionLevel: 1, user: "Аудитор", stops: [] }]);
    renderPage(<CashPage />, ["MenuAuditor"], "/Cash/stops");
    await screen.findByText("Тестовый стоп");
    expect(screen.getByText("Запланирован", { exact: true })).toBeInTheDocument();
    const clock = vi.spyOn(Date, "now").mockReturnValue(start + 11_000);
    try {
      fireEvent.focus(window);
      expect(await screen.findByText("Действует", { exact: true })).toBeInTheDocument();
      clock.mockReturnValue(start + 21_000);
      fireEvent.focus(window);
      expect(await screen.findByText("Стоп-лист пока пуст")).toBeInTheDocument();
      expect(screen.getByText("Стопы (Аудит)", { exact: true })).toBeInTheDocument();
    } finally {
      clock.mockRestore();
      menuApi.getStopPacks.mockResolvedValue([]);
    }
  });

  it("hides employee level-2 stops from the auditor stop list", async () => {
    const begin = new Date(Date.now() - 10_000).toISOString();
    const end = new Date(Date.now() + 3_600_000).toISOString();
    const pack = (id: number, itemName: string, permissionLevel: 1 | 2): StopPack => ({ id, itemId: 100 + id, itemName, locationGUID: null,
      locationName: null, begin, end, permissionLevel, user: "Сотрудник", stops: [] });
    menuApi.getStopPacks.mockResolvedValue([pack(1, "Стоп аудитора", 1), pack(2, "Стоп сотрудника", 2)]);
    try {
      renderPage(<CashPage />, ["MenuAuditor"], "/Cash/stops");
      expect(await screen.findByText("Стоп аудитора")).toBeInTheDocument();
      expect(screen.queryByText("Стоп сотрудника")).not.toBeInTheDocument();
    } finally {
      menuApi.getStopPacks.mockResolvedValue([]);
    }
  });

  it("switches delivery content immediately and preserves its tabs", async () => {
    renderPage(<DeliveryPage />, ["MenuAdmin"], "/Delivery");
    await screen.findByText("Пицца");
    fireEvent.click(screen.getByText("Запросы", { exact: true }));
    expect(await screen.findByText("Выберите торговую точку")).toBeInTheDocument();
    expect(screen.getByText("Меню доставки", { exact: true })).toBeInTheDocument();
  });

  it.each([
    ["MenuMarketing", deliveryRequestRoles],
    ["DeliveryRequests", deliveryMenuRoles],
    ["MenuAdmin", cashRoles],
    ["Menu", cashRoles],
  ])("blocks direct access for %s", (role, required) => {
    renderPage(<Routes><Route path="/private" element={<RequireRole requiredRole={required}><div>Protected content</div></RequireRole>} />
      <Route path="/Main" element={<div>Home</div>} /></Routes>, [role as string], "/private");
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.queryByText("Protected content")).not.toBeInTheDocument();
  });

  it("preserves old group links for employees", () => {
    renderPage(<Routes><Route path="/DeliveryMenu/:groupId" element={<LegacyMenuRedirect />} />
      <Route path="/Cash/items/10" element={<div>Cash category</div>} /></Routes>, ["Menu"], "/DeliveryMenu/10");
    expect(screen.getByText("Cash category")).toBeInTheDocument();
  });

  it("sends the auditor from old menu links to the audit stop list", () => {
    renderPage(<Routes><Route path="/DeliveryMenu/:groupId" element={<LegacyMenuRedirect />} />
      <Route path="/Cash/stops" element={<div>Audit stops</div>} /></Routes>, ["MenuAuditor"], "/DeliveryMenu/10");
    expect(screen.getByText("Audit stops")).toBeInTheDocument();
  });
});

describe("Cash messages", () => {
  const location = "cbe656c5-7b5f-41a1-a0d8-84b75028c272";
  beforeEach(() => {
    api.getCashLocations.mockReset().mockResolvedValue([{ guid: location, name: "Тестовая ТТ" }]);
    api.sendCashMessage.mockReset().mockResolvedValue(undefined);
  });

  async function fillMessage() {
    await screen.findByLabelText("Сообщение");
    fireEvent.change(screen.getByRole("combobox"), { target: { value: location } });
    fireEvent.change(screen.getByLabelText("Сообщение"), { target: { value: "  Тест сообщения  " } });
  }

  it("requires a recipient and nonblank text, submits the contract and prevents duplicate clicks", async () => {
    let finish: () => void = () => {};
    api.sendCashMessage.mockImplementation(() => new Promise<void>((resolve) => { finish = resolve; }));
    renderPage(<CashMessagesPage />, ["MenuAuditor"]);
    const button = await screen.findByRole("button", { name: "Отправить сообщение" });
    expect(button).toBeDisabled();
    await fillMessage();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(api.sendCashMessage).toHaveBeenCalledTimes(1);
    expect(api.sendCashMessage).toHaveBeenCalledWith(location, "Тест сообщения");
    expect(button).toBeDisabled();
    finish();
    expect(await screen.findByRole("status")).toHaveTextContent("Тестовая ТТ");
    expect(screen.getByLabelText("Сообщение")).toHaveValue("");
  });

  it("preserves draft after failed submission and does not claim success", async () => {
    api.sendCashMessage.mockRejectedValue(new Error("Сервис недоступен"));
    renderPage(<CashMessagesPage />, ["MenuAuditor"]);
    await fillMessage();
    fireEvent.click(screen.getByRole("button", { name: "Отправить сообщение" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByLabelText("Сообщение")).toHaveValue("  Тест сообщения  ");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("supports retrying a failed location lookup", async () => {
    api.getCashLocations.mockRejectedValueOnce(new Error("Ошибка загрузки"));
    renderPage(<CashMessagesPage />, ["MenuAuditor"]);
    fireEvent.click(await screen.findByRole("button", { name: "Повторить" }));
    await waitFor(() => expect(screen.getByLabelText("Сообщение")).toBeInTheDocument());
    expect(api.getCashLocations).toHaveBeenCalledTimes(2);
  });

  it("handles no cash locations", async () => {
    api.getCashLocations.mockResolvedValue([]);
    renderPage(<CashMessagesPage />, ["MenuAuditor"]);
    expect(await screen.findByText("Нет доступных торговых точек с кассами.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Отправить сообщение" })).not.toBeInTheDocument();
  });
});
