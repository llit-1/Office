import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import Orders from "../../Pages/Orders/Orders";
import auth from "../../Store/authSlice";
import preferences from "../../Store/preferencesSlice";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";
import userData from "../../Store/userDataSlice";
import { createFakeServer, DAILY, STORE_A, STORE_B, WEEKLY, type FakeServer } from "./orders.fakeServer";

const { show, api } = vi.hoisted(() => ({ show: vi.fn(), api: { server: null as unknown as FakeServer } }));
vi.mock("@toolpad/core", () => ({ useNotifications: () => ({ show }) }));
vi.mock("../../Services/api", async () => ({
  ...(await vi.importActual<typeof import("../../Services/api")>("../../Services/api")),
  get: (url: string, config?: { params?: Record<string, unknown> }) => api.server.get(url, config),
  post: (url: string, body?: unknown) => api.server.post(url, body),
  put: (url: string, body?: unknown) => api.server.put(url, body),
}));

// раздел рендерится целиком — при параллельном прогоне всего набора это небыстро
vi.setConfig({ testTimeout: 20_000 });

// четверг, 8 октября 2026, 14:00 по Москве
const NOW = new Date("2026-10-08T14:00:00+03:00");
const NEAREST = "2026-10-09T12:00:00";
const LATER = "2026-10-12T12:00:00";
const orderButtons = () => screen.queryAllByRole("button", { name: /^№ \d+$/ });
const calls = (pattern: RegExp) => server.calls.filter((call) => pattern.test(`${call.method} ${call.url}`));
let server: FakeServer;

function renderOrders(path: string, roles: string[], lastTypeId: number | null = null) {
  const store = configureStore({
    reducer: { auth, userData, pageTitle, backButton, preferences },
    preloadedState: {
      auth: { id: 5, token: "token", fullName: "Тест Тестов", position: null, initialized: true },
      userData: { newNotifications: [], activeNotifications: [], roles, loaded: true },
      preferences: { ...preferences(undefined, { type: "init" }), ordersTypeId: lastTypeId },
    },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/Orders/*" element={<Orders />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

async function pickOption(user: ReturnType<typeof userEvent.setup>, select: string, option: string | RegExp) {
  await user.click(screen.getByRole("button", { name: select }));
  await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: option }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  server = createFakeServer(() => Date.now());
  api.server = server;
  show.mockReset();
});

afterAll(() => {
  vi.useRealTimers();
});

/* ===== Список ===== */

it("при входе приходят типы и точки; заказы запрашиваются после выбора типа — по всем ТТ", async () => {
  const user = userEvent.setup();
  server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: NEAREST, lines: [{ id: 1, quantity: 6 }] });
  const store = renderOrders("/Orders", ["OrdersTT"]);

  const tabs = within(await screen.findByRole("region", { name: "Тип заказа" })).getAllByRole("button");
  expect(tabs.map((tab) => tab.textContent)).toEqual(["Регулярный (Завтра)", "Еженедельный"]);
  // пока тип не выбран, нет ни списка, ни фильтров, ни запросов заказов
  for (const tab of tabs) expect(tab).toHaveAttribute("aria-pressed", "false");
  expect(screen.getByRole("heading", { name: "Выберите тип заказа" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Новый заказ" })).not.toBeInTheDocument();
  expect(server.calls.map((call) => call.url)).toEqual(["/Order/rules"]);

  await user.click(tabs[0]);
  // точка не выбрана — «Все торговые точки»: location в запросе нет
  const group = await screen.findByRole("button", { name: /Парашютная 63/ });
  expect(calls(/orders$/)).toEqual([{ method: "GET", url: `/Order/rules/${DAILY}/orders`, params: undefined }]);
  expect(screen.getByRole("button", { name: "Торговая точка" })).toHaveTextContent("Все торговые точки");
  // по всем ТТ группы свёрнуты; точек без заказов в списке нет
  expect(group).toHaveAttribute("aria-expanded", "false");
  expect(orderButtons()).toHaveLength(0);
  expect(screen.queryByRole("button", { name: /Невский 87/ })).not.toBeInTheDocument();
  // выбор запоминается до следующего входа в раздел
  expect(store.getState().preferences.ordersTypeId).toBe(DAILY);
  expect(store.getState().pageTitle.title).toBe("Заказы ТТ");
  // без роли администратора вкладки «Настройки» нет
  expect(screen.queryByText("Настройки")).not.toBeInTheDocument();
});

it("при входе открывает тип заказа, выбранный в прошлый раз", async () => {
  const user = userEvent.setup();
  const store = renderOrders("/Orders", ["OrdersTT"], WEEKLY);

  expect(await screen.findByRole("button", { name: "Еженедельный" })).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByRole("heading", { name: "Заказов пока нет" })).toBeInTheDocument();
  expect(calls(/orders$/)[0].url).toBe(`/Order/rules/${WEEKLY}/orders`);

  await user.click(screen.getByRole("button", { name: "Регулярный (Завтра)" }));
  expect(screen.getByRole("button", { name: "Регулярный (Завтра)" })).toHaveAttribute("aria-pressed", "true");
  expect(store.getState().preferences.ordersTypeId).toBe(DAILY);
});

it("запомненный тип, которого больше нет, не выбирается", async () => {
  renderOrders("/Orders", ["OrdersTT"], 99);
  expect(await screen.findByRole("heading", { name: "Выберите тип заказа" })).toBeInTheDocument();
});

it("единственная торговая точка пользователя выбрана сразу и уходит в запрос", async () => {
  server.setLocations([STORE_A]);
  server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: NEAREST, lines: [{ id: 1, quantity: 6 }] });
  renderOrders("/Orders", ["OrdersTT"], DAILY);

  // фильтра по ТТ нет, заказы точки раскрыты
  expect(await screen.findByRole("button", { name: /Парашютная 63/ })).toHaveAttribute("aria-expanded", "true");
  expect(screen.queryByRole("button", { name: "Торговая точка" })).not.toBeInTheDocument();
  expect(orderButtons()).toHaveLength(1);
  expect(calls(/orders$/)).toEqual([{ method: "GET", url: `/Order/rules/${DAILY}/orders`, params: { locationGuid: STORE_A } }]);
});

it("выбор торговой точки перезапрашивает заказы; «Актуальные / Все» фильтрует уже полученные", async () => {
  const user = userEvent.setup();
  const open = server.addOrder({ ruleId: DAILY, locationGuid: STORE_B, creationDateTime: NEAREST, lines: [{ id: 1, quantity: 6 }] });
  const closed = server.addOrder({ ruleId: DAILY, locationGuid: STORE_B, creationDateTime: server.previous(DAILY), lines: [{ id: 4, quantity: 10 }] });
  server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: NEAREST, lines: [{ id: 1, quantity: 6 }] });
  renderOrders(`/Orders?type=${DAILY}`, ["OrdersTT"]);

  await screen.findByRole("button", { name: /Парашютная 63/ });
  await pickOption(user, "Торговая точка", "Невский 87");

  // одна ТТ — заказы видны сразу, только актуальные
  expect(await screen.findByRole("button", { name: `№ ${open.id}` })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Парашютная 63/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: `№ ${closed.id}` })).not.toBeInTheDocument();
  expect(calls(/orders$/).map((call) => call.params)).toEqual([undefined, { locationGuid: STORE_B }]);

  const row = screen.getByRole("button", { name: `№ ${open.id}` }).closest("article")!;
  expect(row).toHaveTextContent("пт, 9 окт 12:00");
  expect(row).toHaveTextContent("сб, 10.10");
  expect(row).toHaveTextContent("Анна Морозова");
  expect(within(row).getByRole("button", { name: `Изменить заказ № ${open.id}` })).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Все" }));
  const closedRow = screen.getByRole("button", { name: `№ ${closed.id}` }).closest("article")!;
  // статусов у заказов нет
  for (const status of ["Принят", "В работе", "Доставлен"]) expect(screen.queryByText(status)).not.toBeInTheDocument();
  // сформированный заказ менять нельзя
  expect(within(closedRow).queryByRole("button", { name: /Изменить/ })).not.toBeInTheDocument();
  // новых запросов переключатель не делает
  expect(calls(/orders$/)).toHaveLength(2);
});

it("карточка заказа запрашивает состав и показывает что и сколько", async () => {
  const user = userEvent.setup();
  const order = server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: NEAREST, lines: [{ id: 2, quantity: 36 }, { id: 4, quantity: 10 }] });
  renderOrders(`/Orders?type=${DAILY}&store=${STORE_A}`, ["OrdersTT"]);

  await user.click(await screen.findByRole("button", { name: `№ ${order.id}` }));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: `Заказ № ${order.id}` })).toBeInTheDocument();
  const table = await within(dialog).findByRole("table", { name: "Состав заказа" });
  expect(calls(/items$/).map((call) => call.url)).toEqual([`/Order/orders/${order.id}/items`]);
  expect(within(table).getAllByRole("row").map((row) => row.textContent)).toEqual([
    "ПозицияКол-во", "Булочка заварная10136", "Морс клюквенный20010", "2 позиции",
  ]);
  expect(within(dialog).getByText("Оформил").nextSibling).toHaveTextContent("Анна Морозова");
  expect(within(dialog).getByText("Дата формирования").nextSibling).toHaveTextContent("пт, 9 окт 12:00");
  expect(within(dialog).getByText("Доставка").nextSibling).toHaveTextContent("сб, 10.10");
  // ни отмены, ни повтора заказа в разделе нет
  expect(within(dialog).queryByRole("button", { name: /Отменить|Повторить/ })).not.toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Изменить" })).toBeInTheDocument();
});

/* ===== Редактор ===== */

it("новый заказ: после выбора ТТ приходят каталог и даты, по умолчанию — ближайшая, доставка показана", async () => {
  const user = userEvent.setup();
  const store = renderOrders(`/Orders/order/${DAILY}`, ["OrdersTT"]);

  // без торговой точки нет ни каталога, ни дат — и запросов тоже
  expect(await screen.findByRole("heading", { name: "Выберите торговую точку" })).toBeInTheDocument();
  expect(store.getState().pageTitle.title).toBe("Регулярный (Завтра)");
  expect(calls(/contents$/)).toHaveLength(0);
  await user.click(screen.getByRole("button", { name: "Оформить заказ" }));
  expect(screen.getByRole("alert")).toHaveTextContent("Выберите торговую точку.");

  await pickOption(user, "Торговая точка", "Парашютная 63");
  const date = await screen.findByRole("button", { name: "Дата формирования заказа" });
  expect(calls(/contents$/)).toEqual([{ method: "GET", url: `/Order/rules/${DAILY}/locations/${STORE_A}/contents`, params: undefined }]);
  expect(date).toHaveTextContent("Ближайшая · пт, 9 окт 12:00");
  expect(screen.getByText("Предполагаемая доставка").parentElement).toHaveTextContent("сб, 10.10");
  expect(screen.getByText("Изменить заказ можно до пт, 9 окт 12:00.")).toBeInTheDocument();
  // прошедшую дату пользователю не предлагаем
  await user.click(date);
  expect(within(screen.getByRole("listbox")).getAllByRole("option")).toHaveLength(20);
  await user.keyboard("{Escape}");

  // выключенных позиций в каталоге нет; кратность подписана
  expect(screen.queryByText("Круассан")).not.toBeInTheDocument();
  expect(screen.getByText("101 · кратно 12")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Добавить «Булочка заварная» в заказ" }));
  await user.click(screen.getByRole("button", { name: "Добавить «Морс клюквенный» в заказ" }));
  expect(screen.getByText("2 позиции")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Оформить заказ" }));
  // после оформления — список типа; точка с новым заказом раскрыта, хотя выбраны все ТТ
  expect(await screen.findByRole("button", { name: /Парашютная 63/ })).toHaveAttribute("aria-expanded", "true");
  expect(calls(/^POST/)).toEqual([{
    method: "POST",
    url: "/Order/orders",
    body: { creationDateTime: NEAREST, locationGuid: STORE_A, ruleId: DAILY, items: [{ id: 2, quantity: 12 }, { id: 4, quantity: 10 }] },
  }]);
  expect(show).toHaveBeenCalledWith(`Заказ № ${server.orders[0].id} оформлен`, expect.objectContaining({ severity: "success" }));
  expect(screen.getByRole("button", { name: `№ ${server.orders[0].id}` })).toBeInTheDocument();
});

it("единственная торговая точка в редакторе подставляется сразу", async () => {
  server.setLocations([STORE_B]);
  renderOrders(`/Orders/order/${DAILY}`, ["OrdersTT"]);

  expect(await screen.findByRole("button", { name: "Дата формирования заказа" })).toHaveTextContent("Ближайшая");
  expect(screen.getByRole("button", { name: "Торговая точка" })).toHaveTextContent("Невский 87");
  expect(calls(/contents$/)[0].url).toBe(`/Order/rules/${DAILY}/locations/${STORE_B}/contents`);
});

it("другая дата: запрашивается с сервера вместе со своей доставкой, набранное остаётся", async () => {
  const user = userEvent.setup();
  renderOrders(`/Orders/order/${DAILY}?store=${STORE_A}`, ["OrdersTT"]);

  await user.click(await screen.findByRole("button", { name: "Добавить «Багет зерновой» в заказ" }));
  await pickOption(user, "Дата формирования заказа", "пн, 12 окт 12:00");

  await waitFor(() => expect(screen.getByRole("button", { name: "Дата формирования заказа" })).toHaveTextContent("пн, 12 окт 12:00"));
  expect(calls(/contents$/).map((call) => call.params)).toEqual([undefined, { creationDateTime: LATER }]);
  expect(screen.getByText("Предполагаемая доставка").parentElement).toHaveTextContent("вт, 13.10");
  expect(screen.getByText("Изменить заказ можно до пн, 12 окт 12:00.")).toBeInTheDocument();
  expect(screen.getByText("1 позиция")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Оформить заказ" }));
  await screen.findByRole("button", { name: "Новый заказ" });
  expect(server.orders).toEqual([expect.objectContaining({ creationDateTime: LATER, lines: [{ id: 1, quantity: 6 }] })]);
});

it("дата, на которую уже есть заказ: предупреждает, что текущий не сохранится", async () => {
  const user = userEvent.setup();
  const taken = server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: LATER, lines: [{ id: 4, quantity: 30 }] });
  const store = renderOrders(`/Orders/order/${DAILY}?store=${STORE_A}`, ["OrdersTT"]);

  await user.click(await screen.findByRole("button", { name: "Добавить «Багет зерновой» в заказ" }));
  // занятая дата помечена номером заказа
  await pickOption(user, "Дата формирования заказа", `пн, 12 окт 12:00 · заказ № ${taken.id}`);

  const warning = await screen.findByRole("dialog");
  expect(within(warning).getByRole("heading", { name: "На эту дату уже есть заказ" })).toBeInTheDocument();
  expect(warning).toHaveTextContent(`У «Парашютная 63» на пн, 12 окт 12:00 уже оформлен заказ № ${taken.id}. Если перейти к нему, текущий заказ не будет сохранён.`);

  // «Остаться» — дата и набранное на месте
  await user.click(within(warning).getByRole("button", { name: "Остаться" }));
  expect(screen.getByRole("button", { name: "Дата формирования заказа" })).toHaveTextContent("Ближайшая · пт, 9 окт 12:00");
  expect(screen.getByText("1 позиция")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Оформить заказ" })).toBeInTheDocument();

  // «Перейти к заказу» — открывается существующий, набранное не сохраняется
  await pickOption(user, "Дата формирования заказа", `пн, 12 окт 12:00 · заказ № ${taken.id}`);
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Перейти к заказу" }));
  expect(await screen.findByRole("button", { name: "Сохранить изменения" })).toBeInTheDocument();
  expect(store.getState().pageTitle.title).toBe(`Заказ № ${taken.id}`);
  // количество видно и в каталоге, и в корзине
  for (const field of screen.getAllByRole("textbox", { name: "Количество «Морс клюквенный»" })) expect(field).toHaveValue("30");
  expect(screen.queryByRole("textbox", { name: "Количество «Багет зерновой»" })).not.toBeInTheDocument();
  expect(calls(/^POST/)).toHaveLength(0);
});

it("с пустой корзиной заказ занятой даты открывается сразу", async () => {
  const user = userEvent.setup();
  const taken = server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: LATER, lines: [{ id: 4, quantity: 30 }] });
  renderOrders(`/Orders/order/${DAILY}?store=${STORE_A}`, ["OrdersTT"]);

  await screen.findByRole("button", { name: "Оформить заказ" });
  await pickOption(user, "Дата формирования заказа", `пн, 12 окт 12:00 · заказ № ${taken.id}`);

  expect(await screen.findByRole("button", { name: "Сохранить изменения" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(show).toHaveBeenCalledWith("На эту дату уже есть заказ — открыли его", expect.objectContaining({ severity: "info" }));
});

it("изменение заказа: открывается по точке и дате, сохраняется на ту же дату", async () => {
  const user = userEvent.setup();
  const order = server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: NEAREST, lines: [{ id: 2, quantity: 24 }] });
  const store = renderOrders(`/Orders/order/${DAILY}?store=${STORE_A}&date=${NEAREST}`, ["OrdersTT"]);

  const submit = await screen.findByRole("button", { name: "Сохранить изменения" });
  expect(store.getState().pageTitle.title).toBe(`Заказ № ${order.id}`);
  expect(calls(/contents$/)[0].params).toEqual({ creationDateTime: NEAREST });

  // количество шагает кратностью и не опускается ниже шага; ручной ввод округляется
  const [inCatalog, inCart] = screen.getAllByRole("textbox", { name: "Количество «Булочка заварная»" });
  expect(inCatalog).toHaveValue("24");
  const [plus] = screen.getAllByRole("button", { name: "Увеличить количество «Булочка заварная»" });
  await user.click(plus);
  await user.click(plus);
  expect(inCart).toHaveValue("48");
  await user.clear(inCart);
  await user.type(inCart, "50{Enter}");
  expect(inCatalog).toHaveValue("48");
  await user.clear(inCart);
  await user.type(inCart, "5{Enter}");
  expect(inCatalog).toHaveValue("12");
  await user.click(plus);
  await user.click(plus);

  await user.click(submit);
  await screen.findByRole("button", { name: "Новый заказ" });
  expect(server.orders).toEqual([expect.objectContaining({ id: order.id, userName: "Тест Тестов", lines: [{ id: 2, quantity: 36 }] })]);
  expect(show).toHaveBeenCalledWith(`Заказ № ${order.id} сохранён`, expect.objectContaining({ severity: "success" }));
});

it("сформированный заказ пользователю на изменение не открывается", async () => {
  const closedAt = server.previous(DAILY);
  const order = server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: closedAt, lines: [{ id: 1, quantity: 6 }] });
  renderOrders(`/Orders/order/${DAILY}?store=${STORE_A}&date=${closedAt}`, ["OrdersTT"]);

  expect(await screen.findByRole("heading", { name: `Заказ № ${order.id} уже нельзя изменить` })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Сохранить изменения" })).not.toBeInTheDocument();
});

it("сформированный заказ не открывается на изменение и администратору; прошедших дат в списке нет", async () => {
  const user = userEvent.setup();
  const closedAt = server.previous(DAILY);
  const order = server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: closedAt, lines: [{ id: 1, quantity: 6 }] });
  renderOrders(`/Orders/order/${DAILY}?store=${STORE_A}&date=${closedAt}`, ["OrdersTTAdmin"]);
  expect(await screen.findByRole("heading", { name: `Заказ № ${order.id} уже нельзя изменить` })).toBeInTheDocument();
  cleanup();

  renderOrders(`/Orders/order/${DAILY}?store=${STORE_A}`, ["OrdersTTAdmin"]);
  await user.click(await screen.findByRole("button", { name: "Дата формирования заказа" }));
  const options = within(screen.getByRole("listbox")).getAllByRole("option");
  expect(options).toHaveLength(20);
  expect(options[0]).toHaveTextContent("Ближайшая · пт, 9 окт 12:00");
});

it("из открытого заказа на свободную дату его позиции не переносятся", async () => {
  const user = userEvent.setup();
  server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: NEAREST, lines: [{ id: 4, quantity: 30 }] });
  renderOrders(`/Orders/order/${DAILY}?store=${STORE_A}&date=${NEAREST}`, ["OrdersTT"]);

  await screen.findByRole("button", { name: "Сохранить изменения" });
  await pickOption(user, "Дата формирования заказа", "пн, 12 окт 12:00");

  // правок не было — переходим сразу, корзина новой даты пустая
  expect(await screen.findByRole("button", { name: "Оформить заказ" })).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByText("В заказе пока пусто")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Количество «Морс клюквенный»" })).not.toBeInTheDocument();
});

it("несохранённые правки открытого заказа при смене даты не теряются без спроса", async () => {
  const user = userEvent.setup();
  const order = server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: NEAREST, lines: [{ id: 4, quantity: 30 }] });
  renderOrders(`/Orders/order/${DAILY}?store=${STORE_A}&date=${NEAREST}`, ["OrdersTT"]);

  await screen.findByRole("button", { name: "Сохранить изменения" });
  await user.click(screen.getByRole("button", { name: "Добавить «Багет зерновой» в заказ" }));
  await pickOption(user, "Дата формирования заказа", "пн, 12 окт 12:00");

  const warning = await screen.findByRole("dialog");
  expect(within(warning).getByRole("heading", { name: "Изменения не сохранены" })).toBeInTheDocument();
  expect(warning).toHaveTextContent(`Изменения в заказе № ${order.id} не сохранены. Если перейти на пн, 12 окт 12:00, они пропадут.`);

  // «Остаться» — тот же заказ с правками
  await user.click(within(warning).getByRole("button", { name: "Остаться" }));
  expect(screen.getByRole("button", { name: "Сохранить изменения" })).toBeInTheDocument();
  expect(screen.getByText("2 позиции")).toBeInTheDocument();

  // «Перейти» — новая дата с пустой корзиной
  await pickOption(user, "Дата формирования заказа", "пн, 12 окт 12:00");
  await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Перейти" }));
  expect(await screen.findByRole("button", { name: "Оформить заказ" })).toBeInTheDocument();
  expect(screen.getByText("В заказе пока пусто")).toBeInTheDocument();
  expect(calls(/^POST/)).toHaveLength(0);
});

it("отказ сервера при сохранении показывается и не теряет набранное", async () => {
  const user = userEvent.setup();
  renderOrders(`/Orders/order/${DAILY}?store=${STORE_A}`, ["OrdersTT"]);

  await user.click(await screen.findByRole("button", { name: "Добавить «Багет зерновой» в заказ" }));
  // пока форма была открыта, приём на эту дату закрылся
  vi.setSystemTime(new Date("2026-10-09T12:30:00+03:00"));
  await user.click(screen.getByRole("button", { name: "Оформить заказ" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Приём изменений по этому заказу уже закрыт.");
  expect(screen.getByText("1 позиция")).toBeInTheDocument();
  expect(server.orders).toHaveLength(0);
});

/* ===== Настройки ===== */

it("настройки доступны только администратору раздела", async () => {
  renderOrders("/Orders/settings", ["OrdersTT"]);
  expect(await screen.findByRole("heading", { name: "Выберите тип заказа" })).toBeInTheDocument();
  expect(screen.queryByRole("table", { name: "Позиции" })).not.toBeInTheDocument();
});

it("настройки администратора — каталог: позиции с кратностью сохраняются на сервер", async () => {
  const user = userEvent.setup();
  renderOrders("/Orders/settings", ["OrdersTTAdmin"]);

  const table = await screen.findByRole("table", { name: "Позиции" });
  expect(screen.getByText("Настройки")).toBeInTheDocument();
  expect(calls(/items$/)[0].url).toBe(`/Order/rules/${DAILY}/items`);
  // в каталоге настроек видны и выключенные позиции
  expect(within(table).getByText("Круассан")).toBeInTheDocument();
  expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent).filter(Boolean)).toEqual([
    "Выбрать все позиции в списке", "Позиция", "Кратность", "Собств.", "Партн.", "Вкл.",
  ]);
  // группы — только фильтр
  expect(within(screen.getByRole("group", { name: "Группы каталога" })).getAllByRole("button").map((chip) => chip.textContent)).toEqual([
    "Все группы4", "Заморозка3", "Напитки1",
  ]);
  expect(screen.queryByRole("button", { name: /Удалить|Переименовать|Добавить группу/ })).not.toBeInTheDocument();

  // выключатель в строке сохраняет позицию целиком
  // сам флажок выключателя скрыт под его рисунком
  fireEvent.click(within(table).getByRole("checkbox", { name: "«Морс клюквенный»: доступна для заказа" }));
  await waitFor(() => expect(calls(/^PUT/)).toHaveLength(1));
  expect(calls(/^PUT/)[0]).toMatchObject({ url: "/Order/items/4", body: { name: "Морс клюквенный", step: 10, actual: 0 } });

  // редактор позиции
  await user.click(within(table).getByRole("button", { name: "Изменить «Багет зерновой»" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByLabelText(/Максимум/)).not.toBeInTheDocument();
  expect(within(dialog).queryByLabelText(/Минимум/)).not.toBeInTheDocument();
  // кратность бывает дробной и вводится через запятую
  const step = within(dialog).getByLabelText("Кратность");
  await user.clear(step);
  await user.type(step, "12,5");
  const access = within(dialog).getByRole("group", { name: "Доступность" });
  await user.click(within(access).getByRole("checkbox", { name: "Партнёрские ТТ" }));
  await user.click(within(dialog).getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(calls(/^PUT/)).toHaveLength(2));
  expect(calls(/^PUT/)[1]).toMatchObject({ url: "/Order/items/1", body: { rkcode: 100, step: 12.5, avaliableForNative: 1, avaliableForFranchise: 0, actual: 1 } });
  expect(show).toHaveBeenCalledWith("«Багет зерновой» сохранена", expect.objectContaining({ severity: "success" }));
});
