import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeliveryMenuPage from "../../Pages/DeliveryMenu/DeliveryMenuPage";
import type { DeliveryGroup, DeliveryItem, StopPack } from "../../Pages/DeliveryMenu/deliveryMenu.types";
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
const createStopPackMock = vi.fn();
const removeLevelTwoStopsMock = vi.fn();
const getActualDeclarationsMock = vi.fn();
const lookupDeclarationMock = vi.fn();
const createDeclarationMock = vi.fn();

vi.mock("@toolpad/core", () => ({
  useNotifications: () => ({ show: showMock }),
}));

vi.mock("../../Pages/DeliveryMenu/deliveryMenu.api", () => ({
  createDeliveryGroup: vi.fn(),
  getActualDeclarations: (...args: unknown[]) => getActualDeclarationsMock(...args),
  lookupDeclaration: (...args: unknown[]) => lookupDeclarationMock(...args),
  createDeclaration: (...args: unknown[]) => createDeclarationMock(...args),
  createDeliveryItem: (...args: unknown[]) => createDeliveryItemMock(...args),
  deleteDeliveryGroup: vi.fn(),
  findDeliveryItem: (...args: unknown[]) => findDeliveryItemMock(...args),
  getDeliveryGroupItems: (...args: unknown[]) => getDeliveryGroupItemsMock(...args),
  getDeliveryGroups: (...args: unknown[]) => getDeliveryGroupsMock(...args),
  getRkReference: vi.fn(),
  getStopPacks: (...args: unknown[]) => getStopPacksMock(...args),
  getStopLocations: (...args: unknown[]) => getStopLocationsMock(...args),
  getStopItems: (...args: unknown[]) => getStopItemsMock(...args),
  createStopPack: (...args: unknown[]) => createStopPackMock(...args),
  updateStopPack: vi.fn(),
  deleteStopPack: vi.fn(),
  removeLevelTwoStops: (...args: unknown[]) => removeLevelTwoStopsMock(...args),
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

function renderPage(roles: string[], path = "/Delivery/menu") {
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

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/Delivery/menu/:groupId?" element={<DeliveryMenuPage />} />
          <Route path="/Cash/items/:groupId?" element={<DeliveryMenuPage />} />
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
    localStorage.clear();
    createStopPackMock.mockReset().mockResolvedValue(undefined);
    removeLevelTwoStopsMock.mockReset().mockResolvedValue(undefined);
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
    getActualDeclarationsMock.mockReset().mockResolvedValue([]);
    lookupDeclarationMock.mockReset();
    createDeclarationMock.mockReset();
  });

  it("shows active categories and quick stops without editing for auditors", async () => {
    renderPage(["MenuAuditor"], "/Cash/items");
    expect(await screen.findByText("Пицца")).toBeInTheDocument();
    expect(screen.queryByText("Архивная категория")).not.toBeInTheDocument();
    expect(screen.queryByText("Новая категория")).not.toBeInTheDocument();
    await openCategory();
    expect(screen.queryByRole("button", { name: "Редактировать Маргарита" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Поставить стоп на Маргарита" })).toBeInTheDocument();
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

  it("loads items of active categories for declaration counters and the opened group on demand", async () => {
    renderPage(["MenuMarketing"]);

    const categoryTitle = await screen.findByText("Пицца");
    // Экран категорий читает позиции активных категорий — для счётчиков позиций без декларации.
    await waitFor(() => expect(getDeliveryGroupItemsMock).toHaveBeenCalledWith(group.id));
    expect(getDeliveryGroupItemsMock).not.toHaveBeenCalledWith(inactiveGroup.id);
    const callsBeforeOpen = getDeliveryGroupItemsMock.mock.calls.length;

    fireEvent.click(categoryTitle.closest("button")!);

    expect(await screen.findByText("Маргарита")).toBeInTheDocument();
    expect(getDeliveryGroupItemsMock).toHaveBeenCalledTimes(callsBeforeOpen + 1);
    expect(getDeliveryGroupItemsMock).toHaveBeenLastCalledWith(group.id);
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
    const callsBeforeSave = getDeliveryGroupItemsMock.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Редактировать Маргарита" }));
    fireEvent.change(screen.getByLabelText("Название на витрине"), { target: { value: "Маргарита новая" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить изменения" }));

    expect(await screen.findByText("Маргарита новая")).toBeInTheDocument();
    await waitFor(() => expect(updateDeliveryItemMock).toHaveBeenCalledTimes(1));
    expect(getDeliveryGroupItemsMock).toHaveBeenCalledTimes(callsBeforeSave);
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

    renderPage(["Menu"], "/Cash/items");
    await openCategory();

    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("00 Тестовая ТТ", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Поставить стоп на Маргарита" })).toBeEnabled();
  });

  it("never shows quick stops in Delivery, even for administrators with auditor access", async () => {
    getStopLocationsMock.mockResolvedValue([{
      guid: "cbe656c5-7b5f-41a1-a0d8-84b75028c272",
      name: "00 Тестовая ТТ",
      actual: 1,
      rkCode: null,
      aggregatorsCode: null,
    }]);

    renderPage(["MenuAdmin", "MenuAuditor"]);

    expect(await screen.findByText("Новая категория")).toBeInTheDocument();
    expect(screen.queryByText("Стоп-листы")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    await openCategory();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Редактировать Маргарита" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Поставить стоп на Маргарита" })).not.toBeInTheDocument();
    expect(getStopPacksMock).not.toHaveBeenCalled();
  });

  it("keeps Cash read-only when the auditor also has marketing access", async () => {
    renderPage(["MenuMarketing", "MenuAuditor"], "/Cash/items");
    await openCategory();
    expect(screen.queryByRole("button", { name: "Редактировать Маргарита" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Добавить позицию" })).not.toBeInTheDocument();
    expect(screen.queryByText("Старая пицца")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("keeps employee quick stops when the employee also has marketing access", async () => {
    renderPage(["Menu", "MenuMarketing"], "/Cash/items");
    await openCategory();
    expect(screen.getByRole("button", { name: "Поставить стоп на Маргарита" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Редактировать Маргарита" })).not.toBeInTheDocument();
  });
});

const cashLocation = { guid: "cbe656c5-7b5f-41a1-a0d8-84b75028c272", name: "Первая ТТ", actual: 1, rkCode: 1, aggregatorsCode: 1 };
const secondLocation = { ...cashLocation, guid: "b2c147c8-28c1-4a43-bd0b-a9b016d78625", name: "Вторая ТТ" };
function pack(level: 1 | 2, end = Date.now() + 3_600_000): StopPack {
  const begin = new Date(Date.now() - 60_000).toISOString();
  return { id: level, itemId: item.rkcode, itemName: item.rkName, locationGUID: null, locationName: null,
    begin, end: new Date(end).toISOString(), user: "Аудитор", permissionLevel: level,
    stops: [{ id: level, packId: level, item: item.rkcode, locationGUID: cashLocation.guid, begin, end: new Date(end).toISOString() }] };
}

describe("Quick stop search, statuses and location", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    getDeliveryGroupsMock.mockResolvedValue([group, inactiveGroup]);
    getDeliveryGroupItemsMock.mockResolvedValue([item, inactiveItem]);
    getStopLocationsMock.mockResolvedValue([cashLocation, secondLocation]);
    getStopPacksMock.mockResolvedValue([]);
    createStopPackMock.mockResolvedValue(undefined);
    removeLevelTwoStopsMock.mockResolvedValue(undefined);
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it("searches every active category without opening one and reuses loaded results", async () => {
    const drinks = { ...group, id: 20, yaName: "Напитки" };
    const tea = { ...item, rkcode: 201, yeGroup: 20, yeName: "Зелёный чай", rkName: "Чай RK" };
    getDeliveryGroupsMock.mockResolvedValue([group, drinks, inactiveGroup]);
    getDeliveryGroupItemsMock.mockImplementation(async (id) => id === 20 ? [tea] : [item, inactiveItem]);
    renderPage(["MenuAuditor"], "/Cash/items");
    fireEvent.change(await screen.findByLabelText("Поиск по всем категориям"), { target: { value: "чай" } });
    const card = (await screen.findByText("Зелёный чай")).closest("article")!;
    expect(within(card).getByText("Напитки")).toBeInTheDocument();
    expect(within(card).getByText("Доступно")).toBeInTheDocument();
    expect(getDeliveryGroupItemsMock).toHaveBeenCalledTimes(2);
    expect(getDeliveryGroupItemsMock).not.toHaveBeenCalledWith(inactiveGroup.id);
    fireEvent.change(screen.getByLabelText("Поиск по всем категориям"), { target: { value: "101" } });
    expect(await screen.findByText("Маргарита")).toBeInTheDocument();
    expect(getDeliveryGroupItemsMock).toHaveBeenCalledTimes(2);
  });

  it("shows how many items of each category are stopped at the selected location", async () => {
    const drinks = { ...group, id: 20, yaName: "Напитки" };
    const tea = { ...item, rkcode: 201, yeGroup: 20, yeName: "Зелёный чай", rkName: "Чай RK" };
    getDeliveryGroupsMock.mockResolvedValue([group, drinks, inactiveGroup]);
    getDeliveryGroupItemsMock.mockImplementation(async (id) => id === 20 ? [tea] : [item, inactiveItem]);
    // Маргарита (категория «Пицца») в стопе дважды — считается одна позиция.
    getStopPacksMock.mockResolvedValue([pack(2), pack(1)]);
    renderPage(["MenuAuditor"], "/Cash/items");

    const pizzaCard = (await screen.findByText("Пицца")).closest("article")!;
    expect(await within(pizzaCard).findByTitle("В стопе позиций: 1")).toHaveTextContent("1 в стопе");
    const drinksCard = screen.getByText("Напитки").closest("article")!;
    expect(within(drinksCard).queryByTitle(/В стопе позиций/)).not.toBeInTheDocument();
  });

  it("shows global stop precedence and prevents quick removal of it", async () => {
    getStopPacksMock.mockResolvedValue([pack(2), pack(1)]);
    renderPage(["MenuAuditor"], "/Cash/items");
    await openCategory();
    expect(screen.getByText("Глобальный стоп")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Глобальный стоп на Маргарита" })).toBeDisabled();
    expect(screen.queryByText("Стоп до 00:00")).not.toBeInTheDocument();
  });

  it("does not display incomplete global search as an empty result and allows retry", async () => {
    getDeliveryGroupItemsMock.mockRejectedValueOnce(new Error("Ошибка категории"));
    renderPage(["MenuAuditor"], "/Cash/items");
    fireEvent.change(await screen.findByLabelText("Поиск по всем категориям"), { target: { value: "Маргарита" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось загрузить позиции всех категорий.");
    expect(screen.queryByText("Ничего не найдено")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить поиск" }));
    expect(await screen.findByText("Маргарита")).toBeInTheDocument();
    expect(screen.queryByText("Старая пицца")).not.toBeInTheDocument();
  });

  it("restores auditor selection and remembers a new selection across remounts", async () => {
    localStorage.setItem("office:cash-location:session", secondLocation.guid);
    const view = renderPage(["MenuAuditor"], "/Cash/items");
    await screen.findByRole("combobox");
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue(secondLocation.guid));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: cashLocation.guid } });
    expect(localStorage.getItem("office:cash-location:session")).toBe(cashLocation.guid);
    view.unmount();
    renderPage(["MenuAuditor"], "/Cash/items");
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue(cashLocation.guid));
  });

  it("ignores an inaccessible saved location and never applies auditor preference for employees", async () => {
    localStorage.setItem("office:cash-location:session", "missing");
    const view = renderPage(["MenuAuditor"], "/Cash/items");
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue(cashLocation.guid));
    view.unmount();
    localStorage.setItem("office:cash-location:session", secondLocation.guid);
    renderPage(["Menu"], "/Cash/items");
    expect(await screen.findByText("Первая ТТ", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("refreshes on focus, preserves the search and blocks mutations after a failed refresh", async () => {
    renderPage(["MenuAuditor"], "/Cash/items");
    await openCategory();
    getStopPacksMock.mockResolvedValue([pack(2)]);
    fireEvent.focus(window);
    expect(await screen.findByText("Стоп до 00:00")).toBeInTheDocument();
    getStopPacksMock.mockRejectedValue(new Error("Нет связи"));
    fireEvent.focus(window);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Статус не подтверждён")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Снять стоп с Маргарита" })).toBeDisabled();
    expect(screen.getByText("Маргарита")).toBeInTheDocument();
  });

  it("expires a stop after time advances even when the API still returns it", async () => {
    const end = Date.now() + 3000;
    getStopPacksMock.mockResolvedValue([pack(2, end)]);
    renderPage(["MenuAuditor"], "/Cash/items");
    await openCategory();
    expect(screen.getByText("Стоп до 00:00")).toBeInTheDocument();
    vi.spyOn(Date, "now").mockReturnValue(end + 1);
    fireEvent.focus(window);
    expect(await screen.findByText("Доступно")).toBeInTheDocument();
  });

  it("fixes the confirmation recipient and aborts when the status changed externally", async () => {
    renderPage(["MenuAuditor"], "/Cash/items");
    await openCategory();
    fireEvent.click(screen.getByRole("button", { name: "Поставить стоп на Маргарита" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Первая ТТ");
    expect(screen.getByRole("combobox")).toBeDisabled();
    getStopPacksMock.mockResolvedValue([pack(1)]);
    fireEvent.click(within(dialog).getByRole("button", { name: "Поставить стоп" }));
    await waitFor(() => expect(showMock).toHaveBeenCalledWith(expect.stringContaining("Состояние позиции изменилось"), expect.anything()));
    expect(createStopPackMock).not.toHaveBeenCalled();
    expect(removeLevelTwoStopsMock).not.toHaveBeenCalled();
  });

  it("submits the confirmed item and location after revalidation", async () => {
    renderPage(["MenuAuditor"], "/Cash/items");
    await openCategory();
    fireEvent.click(screen.getByRole("button", { name: "Поставить стоп на Маргарита" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Поставить стоп" }));
    await waitFor(() => expect(createStopPackMock).toHaveBeenCalledWith(expect.objectContaining({
      itemId: item.rkcode, permissionLevel: 2, stops: [{ locationGUID: cashLocation.guid, item: item.rkcode }],
    })));
  });
});

const declaration = {
  id: 7,
  docNumber: "ЕАЭС N RU Д-RU.РА01.В.11111/24",
  fsaId: 1,
  dateFrom: "2024-01-10T00:00:00",
  dateTo: "2029-01-09T00:00:00",
  manufacturerName: "ООО Пекарня",
  legalAddress: "Москва",
  productionAddress: null,
  productName: "Хлебобулочные изделия",
  tnvedCodes: "1905908000,1905901000",
};

describe("Declarations (platform economy law)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    getDeliveryGroupsMock.mockResolvedValue([group]);
    getDeliveryGroupItemsMock.mockResolvedValue([item]);
    getStopPacksMock.mockResolvedValue([]);
    getStopLocationsMock.mockResolvedValue([]);
    getActualDeclarationsMock.mockResolvedValue([declaration]);
    updateDeliveryItemMock.mockResolvedValue(undefined);
  });

  async function openEditor() {
    renderPage(["MenuMarketing"]);
    await openCategory();
    fireEvent.click(screen.getByRole("button", { name: "Редактировать Маргарита" }));
    return screen.findByRole("dialog", { name: "Редактирование позиции" });
  }

  it("counts active items without a valid declaration on the category card", async () => {
    const withValid = { ...item, rkcode: 102, yeName: "С декларацией", declaration: 7, tnvedCode: "1905908000" };
    const withExpired = { ...item, rkcode: 103, yeName: "С истёкшей", declaration: 99 };
    getDeliveryGroupItemsMock.mockResolvedValue([item, withValid, withExpired, inactiveItem]);
    renderPage(["MenuMarketing"]);

    const card = (await screen.findByText("Пицца")).closest("article")!;
    // Маргарита — нет декларации, «С истёкшей» — нет среди действующих; неактивная позиция не считается.
    expect(await within(card).findByTitle("Позиций без действующей декларации: 2")).toHaveTextContent("2 без декларации");
  });

  it("marks items with valid, expired and missing declarations", async () => {
    const withValid = { ...item, rkcode: 102, yeName: "С декларацией", declaration: 7 };
    const withExpired = { ...item, rkcode: 103, yeName: "С истёкшей", declaration: 99 };
    getDeliveryGroupItemsMock.mockResolvedValue([item, withValid, withExpired]);
    renderPage(["MenuMarketing"]);
    await openCategory();

    expect(await within(screen.getByText("Маргарита").closest("article")!).findByText("Нет декларации")).toBeInTheDocument();
    expect(within(screen.getByText("С декларацией").closest("article")!).getByText("Декларация")).toBeInTheDocument();
    expect(within(screen.getByText("С истёкшей").closest("article")!).getByText("Декларация истекла")).toBeInTheDocument();
  });

  it("attaches a declaration from the base and requires choosing one of its TN VED codes", async () => {
    const dialog = await openEditor();

    fireEvent.change(await within(dialog).findByLabelText("Поиск декларации"), { target: { value: "pa01.b.11111" } });
    fireEvent.click(await within(dialog).findByRole("button", { name: /11111\/24/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить изменения" }));
    expect(await within(dialog).findAllByText("Выберите код ТН ВЭД из декларации.")).not.toHaveLength(0);
    expect(updateDeliveryItemMock).not.toHaveBeenCalled();

    const codeSelect = within(dialog).getByText("Код ТН ВЭД позиции *").parentElement!;
    fireEvent.click(codeSelect.querySelector("div")!);
    fireEvent.click(screen.getAllByRole("option", { name: "1905901000" }).find((option) => option.tagName === "DIV")!);
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить изменения" }));

    await waitFor(() => expect(updateDeliveryItemMock).toHaveBeenCalledTimes(1));
    expect(updateDeliveryItemMock.mock.calls[0][1]).toMatchObject({ declaration: 7, tnvedCode: "1905901000" });
    expect(createDeclarationMock).not.toHaveBeenCalled();
  });

  it("looks a declaration up in the registry, saves it first and then the item with its id", async () => {
    lookupDeclarationMock.mockResolvedValue({
      docNumber: "ЕАЭС N RU Д-RU.РА01.В.68440/24",
      fsaId: 5,
      dateFrom: "2024-02-01T00:00:00",
      dateTo: "2029-01-31T00:00:00",
      manufacturerName: "ООО Мельница",
      legalAddress: "Тула",
      productionAddress: "Тула, цех 2",
      productName: "Булочки",
      tnvedCodes: [{ code: "1905908000", name: "Хлеб" }],
    });
    createDeclarationMock.mockResolvedValue({ ...declaration, id: 42, docNumber: "ЕАЭС N RU Д-RU.РА01.В.68440/24" });
    const dialog = await openEditor();

    fireEvent.change(await within(dialog).findByLabelText("Поиск декларации"), { target: { value: "ЕАЭС N RU Д-RU.РА01.В.68440/24" } });
    expect(within(dialog).getByText("В базе нет такой декларации.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Поиск в реестре" }));
    expect(await within(dialog).findByText("Из реестра · сохранится с позицией")).toBeInTheDocument();
    expect(lookupDeclarationMock).toHaveBeenCalledWith("ЕАЭС N RU Д-RU.РА01.В.68440/24");

    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить изменения" }));

    await waitFor(() => expect(updateDeliveryItemMock).toHaveBeenCalledTimes(1));
    expect(createDeclarationMock).toHaveBeenCalledWith(expect.objectContaining({
      docNumber: "ЕАЭС N RU Д-RU.РА01.В.68440/24",
      manufacturerName: "ООО Мельница",
      tnvedCodes: "1905908000",
    }));
    expect(createDeclarationMock.mock.invocationCallOrder[0]).toBeLessThan(updateDeliveryItemMock.mock.invocationCallOrder[0]);
    // Единственный код подставляется сам.
    expect(updateDeliveryItemMock.mock.calls[0][1]).toMatchObject({ declaration: 42, tnvedCode: "1905908000" });
  });

  it("offers the registry lookup only when nothing matches in the base and reports 404", async () => {
    lookupDeclarationMock.mockResolvedValue(null);
    const dialog = await openEditor();

    fireEvent.change(await within(dialog).findByLabelText("Поиск декларации"), { target: { value: "11111" } });
    expect(within(dialog).queryByRole("button", { name: "Поиск в реестре" })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("Поиск декларации"), { target: { value: "ЕАЭС N RU Д-RU.НЕТ" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Поиск в реестре" }));
    expect(await within(dialog).findByText("Декларация не найдена в реестре. Проверьте номер.")).toBeInTheDocument();
  });

  it("unlinks the declaration from the item", async () => {
    getDeliveryGroupItemsMock.mockResolvedValue([{ ...item, declaration: 7, tnvedCode: "1905908000" }]);
    const dialog = await openEditor();

    expect(await within(dialog).findByText("Действует")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Отвязать декларацию" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Сохранить изменения" }));

    await waitFor(() => expect(updateDeliveryItemMock).toHaveBeenCalledTimes(1));
    expect(updateDeliveryItemMock.mock.calls[0][1]).toMatchObject({ declaration: null, tnvedCode: null });
  });
});

it("marks the declaration as required for a new item and does not create it without one", async () => {
  localStorage.clear();
  vi.clearAllMocks();
  getDeliveryGroupsMock.mockResolvedValue([group]);
  getDeliveryGroupItemsMock.mockResolvedValue([item]);
  getActualDeclarationsMock.mockResolvedValue([]);
  renderPage(["MenuMarketing"]);
  await openCategory();

  fireEvent.click(screen.getByRole("button", { name: "Добавить позицию" }));
  const dialog = await screen.findByRole("dialog", { name: "Новая позиция" });
  expect(within(dialog).getByText("Декларация соответствия *")).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Добавить позицию" }));
  expect(createDeliveryItemMock).not.toHaveBeenCalled();
});
