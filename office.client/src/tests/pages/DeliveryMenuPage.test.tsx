import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DeliveryMenuPage from "../../Pages/DeliveryMenu/DeliveryMenuPage";
import type { DeliveryGroup, DeliveryItem } from "../../Pages/DeliveryMenu/deliveryMenu.types";
import backButtonReducer from "../../Store/stateForBackButtonSlice";
import pageTitleReducer from "../../Store/stateForPageTitleSlice";
import userDataReducer from "../../Store/userDataSlice";

const getDeliveryGroupsMock = vi.fn();
const getDeliveryGroupItemsMock = vi.fn();
const getStopPacksMock = vi.fn();
const getStopLocationsMock = vi.fn();
const getStopItemsMock = vi.fn();
const findDeliveryItemMock = vi.fn();
const createDeliveryItemMock = vi.fn();
const updateDeliveryItemMock = vi.fn();
const setDeliveryItemActualMock = vi.fn();
const showMock = vi.fn();

vi.mock("@toolpad/core", () => ({
  useNotifications: () => ({ show: showMock }),
}));

vi.mock("../../Pages/DeliveryMenu/deliveryMenu.api", () => ({
  createDeliveryGroup: vi.fn(),
  createDeliveryItem: (...args: unknown[]) => createDeliveryItemMock(...args),
  deleteDeliveryGroup: vi.fn(),
  findDeliveryItem: (...args: unknown[]) => findDeliveryItemMock(...args),
  getDeliveryGroupItems: (...args: unknown[]) => getDeliveryGroupItemsMock(...args),
  getDeliveryGroups: (...args: unknown[]) => getDeliveryGroupsMock(...args),
  getRkReference: vi.fn(),
  getStopPacks: (...args: unknown[]) => getStopPacksMock(...args),
  getStopLocations: (...args: unknown[]) => getStopLocationsMock(...args),
  getStopItems: (...args: unknown[]) => getStopItemsMock(...args),
  createStopPack: vi.fn(),
  updateStopPack: vi.fn(),
  deleteStopPack: vi.fn(),
  removeLevelTwoStops: vi.fn(),
  setDeliveryItemActual: (...args: unknown[]) => setDeliveryItemActualMock(...args),
  updateDeliveryGroup: vi.fn(),
  updateDeliveryItem: (...args: unknown[]) => updateDeliveryItemMock(...args),
}));

const group: DeliveryGroup = {
  id: 10,
  yaName: "Пицца",
  imgUpdated: "",
  actual: 1,
  image: "",
};

const inactiveGroup: DeliveryGroup = {
  id: 11,
  yaName: "Архивная категория",
  imgUpdated: "",
  actual: 0,
  image: "",
};

const item: DeliveryItem = {
  rkcode: 101,
  yeGroup: group.id,
  rkName: "Маргарита RK",
  yeName: "Маргарита",
  description: "Томаты и сыр",
  price: 550,
  measure: 500,
  measureUnit: "г",
  imageHash: " ",
  actual: 1,
  image: "aGVsbG8=",
};

const inactiveItem: DeliveryItem = {
  ...item,
  rkcode: 102,
  rkName: "Старая пицца RK",
  yeName: "Старая пицца",
  actual: 0,
};

function renderPage(roles: string[]) {
  const store = configureStore({
    reducer: {
      backButton: backButtonReducer,
      pageTitle: pageTitleReducer,
      userData: userDataReducer,
    },
    preloadedState: {
      backButton: { path: "/Main", visible: false },
      pageTitle: { title: "" },
      userData: {
        newNotifications: [],
        activeNotifications: [],
        roles,
        loaded: true,
      },
    },
  });

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/DeliveryMenu"]}>
        <Routes>
          <Route path="/DeliveryMenu/:groupId?" element={<DeliveryMenuPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

async function openCategory() {
  const categoryTitle = await screen.findByText("Пицца");
  const categoryButton = categoryTitle.closest("button");
  expect(categoryButton).not.toBeNull();
  fireEvent.click(categoryButton!);
  await screen.findByText("Маргарита");
}

describe("DeliveryMenuPage role controls", () => {
  beforeEach(() => {
    getDeliveryGroupsMock.mockReset();
    getDeliveryGroupItemsMock.mockReset();
    getStopPacksMock.mockReset();
    getStopLocationsMock.mockReset();
    getStopItemsMock.mockReset();
    findDeliveryItemMock.mockReset();
    createDeliveryItemMock.mockReset();
    updateDeliveryItemMock.mockReset();
    setDeliveryItemActualMock.mockReset();
    showMock.mockReset();
    getDeliveryGroupsMock.mockResolvedValue([group, inactiveGroup]);
    getDeliveryGroupItemsMock.mockResolvedValue([item, inactiveItem]);
    getStopPacksMock.mockResolvedValue([]);
    getStopLocationsMock.mockResolvedValue([]);
    getStopItemsMock.mockResolvedValue([item, inactiveItem]);
    findDeliveryItemMock.mockResolvedValue(null);
  });

  it("sends MenuAuditor directly to stop management without menu categories", async () => {
    renderPage(["MenuAuditor"]);

    expect(await screen.findAllByRole("button", { name: "Создать стоп" })).not.toHaveLength(0);
    expect(screen.queryByRole("heading", { name: "Стоп-листы" })).not.toBeInTheDocument();
    expect(screen.getByText("Стоп-лист пока пуст")).toBeInTheDocument();
    expect(screen.queryByText("Пицца")).not.toBeInTheDocument();
    expect(screen.queryByText("Архивная категория")).not.toBeInTheDocument();
    expect(screen.queryByText("Новая категория")).not.toBeInTheDocument();
  });

  it("shows category and item management controls with MenuMarketing", async () => {
    renderPage(["MenuMarketing"]);

    expect(await screen.findByText("Новая категория")).toBeInTheDocument();
    expect(screen.getByText("Архивная категория")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Изменить Пицца" })).toBeInTheDocument();

    await openCategory();

    expect(screen.getByText("Старая пицца")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Изменить категорию" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить категорию" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить позицию" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Редактировать Маргарита" })).not.toHaveLength(0);
    expect(screen.queryByRole("button", { name: /Поставить стоп|Снять стоп|Заблокировать/ })).not.toBeInTheDocument();
  });

  it("loads group items only after the group is opened", async () => {
    renderPage(["MenuMarketing"]);

    const categoryTitle = await screen.findByText("Пицца");
    expect(getDeliveryGroupItemsMock).not.toHaveBeenCalled();

    fireEvent.click(categoryTitle.closest("button")!);

    expect(await screen.findByText("Маргарита")).toBeInTheDocument();
    expect(getDeliveryGroupItemsMock).toHaveBeenCalledTimes(1);
    expect(getDeliveryGroupItemsMock).toHaveBeenCalledWith(group.id);
  });

  it("shows active items before inactive items", async () => {
    getDeliveryGroupItemsMock.mockResolvedValue([inactiveItem, item]);
    renderPage(["MenuMarketing"]);

    await openCategory();

    const activeCard = screen.getByText("Маргарита").closest("article");
    const inactiveCard = screen.getByText("Старая пицца").closest("article");
    expect(activeCard).not.toBeNull();
    expect(inactiveCard).not.toBeNull();
    expect(activeCard!.compareDocumentPosition(inactiveCard!) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  it("updates an item locally without reloading the group", async () => {
    renderPage(["MenuMarketing"]);
    await openCategory();

    fireEvent.click(screen.getByRole("button", { name: "Редактировать Маргарита" }));
    fireEvent.change(screen.getByLabelText("Название на витрине"), { target: { value: "Маргарита новая" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));

    expect(await screen.findByText("Маргарита новая")).toBeInTheDocument();
    await waitFor(() => expect(updateDeliveryItemMock).toHaveBeenCalledTimes(1));
    expect(getDeliveryGroupItemsMock).toHaveBeenCalledTimes(1);
    expect(updateDeliveryItemMock.mock.calls[0]?.[1]).toMatchObject({ imageHash: "" });
  });

  it("automatically uses the first location for Menu without showing a selector", async () => {
    getStopLocationsMock.mockResolvedValue([{
      guid: "cbe656c5-7b5f-41a1-a0d8-84b75028c272",
      name: "00 Тестовая ТТ",
      actual: 1,
      rkCode: null,
      aggregatorsCode: null,
    }]);

    renderPage(["Menu"]);
    await openCategory();

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByText("Торговая точка")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Поставить стоп на Маргарита" })).toBeEnabled();
  });

  it("opens categories for MenuAdmin and combines menu and stop controls", async () => {
    getStopLocationsMock.mockResolvedValue([{
      guid: "cbe656c5-7b5f-41a1-a0d8-84b75028c272",
      name: "00 Тестовая ТТ",
      actual: 1,
      rkCode: null,
      aggregatorsCode: null,
    }]);

    renderPage(["MenuAdmin"]);

    expect(await screen.findByText("Новая категория")).toBeInTheDocument();
    expect(screen.getByText("Стоп-листы")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await openCategory();
    expect(screen.getByRole("combobox")).toHaveValue("cbe656c5-7b5f-41a1-a0d8-84b75028c272");
    expect(screen.getByRole("button", { name: "Редактировать Маргарита" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Поставить стоп на Маргарита" })).toBeEnabled();
  });
});
