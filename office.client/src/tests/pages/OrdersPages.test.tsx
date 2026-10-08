import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import Orders from "../../Pages/Orders/Orders";
import { getCatalog, getOrders, getOrdersBootstrap } from "../../Pages/Orders/orders.api";
import { resetDb } from "../../Pages/Orders/orders.mock";
import { findStoreOffset, mskMoment, resolveSlot } from "../../Pages/Orders/orders.rules";
import auth from "../../Store/authSlice";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";
import userData from "../../Store/userDataSlice";

const { show } = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock("@toolpad/core", () => ({ useNotifications: () => ({ show }) }));

// раздел рендерится целиком на демо-данных — при параллельном прогоне всего набора это небыстро
vi.setConfig({ testTimeout: 20_000 });

// четверг, 8 октября 2026, 14:00 по Москве
const NOW = new Date(mskMoment("2026-10-08", "14:00"));
const WEEKLY = 4;
const orderButtons = () => screen.queryAllByRole("button", { name: /^№ \d+$/ });

function renderOrders(path: string, roles: string[]) {
  const store = configureStore({
    reducer: { auth, userData, pageTitle, backButton },
    preloadedState: {
      auth: { id: 5, token: "token", fullName: "Тест Тестов", position: null, initialized: true },
      userData: { newNotifications: [], activeNotifications: [], roles, loaded: true },
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

/** Торговые точки с заказом на ближайшую еженедельную доставку и без него. */
async function weeklyStores() {
  const [base, orders] = await Promise.all([getOrdersBootstrap(), getOrders()]);
  const type = base.types.find((candidate) => candidate.id === WEEKLY)!;
  const open = base.stores.filter((store) => !store.closed);
  const find = (store: (typeof open)[number]) => {
    const slot = resolveSlot(type, findStoreOffset(base.deliveryDays, WEEKLY, store.id), NOW)!;
    return { slot, order: orders.find((order) => order.typeId === WEEKLY && order.storeId === store.id && order.deliveryDate === slot.deliveryDate && !order.cancelledAt) };
  };
  const busy = open.find((store) => find(store).order)!;
  const free = open.find((store) => !find(store).order)!;
  return { busy, existing: find(busy).order!, free, freeSlot: find(free).slot };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  resetDb(NOW);
  show.mockReset();
});

afterAll(() => {
  vi.useRealTimers();
});

it("показывает шесть вкладок, а список по всем ТТ открывает свёрнутым", async () => {
  const store = renderOrders("/Orders", ["OrdersTT"]);

  expect(await screen.findByRole("button", { name: /^Регулярный \(Завтра\).*Приём до пт, 9 окт 12:00/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Регулярный \(Послезавтра\).*Приём до пт, 9 окт 12:00/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Регулярный \(Через 3 дня\).*Приём до чт, 8 окт 17:00/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Еженедельный.*Приём до пн, 12 окт 00:00/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Ежемесячный/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Ценники/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Все заказы/ })).toHaveAttribute("aria-pressed", "true");

  expect(screen.getByRole("button", { name: /Парашютная 63/ })).toHaveAttribute("aria-expanded", "false");
  expect(orderButtons()).toHaveLength(0);
  // без роли администратора вкладок раздела нет вовсе; журнала в разделе нет ни у кого
  expect(screen.queryByText("Настройки")).not.toBeInTheDocument();
  expect(screen.queryByText("Журнал")).not.toBeInTheDocument();
  expect(store.getState().pageTitle.title).toBe("Заказы ТТ");
});

it("заказы видны после раскрытия точки или выбора одной ТТ", async () => {
  const user = userEvent.setup();
  renderOrders("/Orders", ["OrdersTT"]);

  const group = await screen.findByRole("button", { name: /Парашютная 63/ });
  await user.click(group);
  expect(group).toHaveAttribute("aria-expanded", "true");
  expect(orderButtons().length).toBeGreaterThan(0);

  await user.click(screen.getByRole("button", { name: "Торговая точка" }));
  await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Невский 87" }));
  expect(screen.getByRole("button", { name: /Невский 87/ })).toHaveAttribute("aria-expanded", "true");
  expect(screen.queryByRole("button", { name: /Парашютная 63/ })).not.toBeInTheDocument();
  expect(orderButtons().length).toBeGreaterThan(0);
});

it("открывает карточку заказа с составом", async () => {
  const user = userEvent.setup();
  renderOrders("/Orders?store=1", ["OrdersTT"]);

  const [first] = await screen.findAllByRole("button", { name: /^№ \d+$/ });
  await user.click(first);

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("heading", { name: first.textContent!.replace("№", "Заказ №") })).toBeInTheDocument();
  expect(within(dialog).getByRole("table", { name: "Состав заказа" })).toBeInTheDocument();
  expect(within(dialog).getByText("Оформил")).toBeInTheDocument();
  expect(within(dialog).queryByText(/История/)).not.toBeInTheDocument();
});

it("новый заказ: дата доставки считается сама, обязательные поля проверяются", async () => {
  const user = userEvent.setup();
  const { free, freeSlot } = await weeklyStores();
  const store = renderOrders(`/Orders/new/${WEEKLY}`, ["OrdersTT"]);

  const submit = await screen.findByRole("button", { name: "Оформить заказ" });
  expect(store.getState().pageTitle.title).toBe("Еженедельный");
  // даты нет, пока не выбрана торговая точка; выбрать её вручную нельзя
  expect(screen.getByText("после выбора ТТ")).toBeInTheDocument();
  expect(screen.queryByLabelText("Дата доставки")).not.toBeInTheDocument();

  const [add] = screen.getAllByRole("button", { name: /^Добавить «.+» в заказ$/ });
  await user.click(add);
  expect(screen.getByText("1 позиция")).toBeInTheDocument();

  await user.click(submit);
  expect(screen.getByRole("alert")).toHaveTextContent("Выберите торговую точку.");

  await user.click(screen.getByRole("button", { name: "Торговая точка" }));
  await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: free.name }));
  expect(screen.getByText("Изменить или отменить заказ можно до пн, 12 окт 00:00.")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Оформить заказ" }));

  // после оформления точка с новым заказом раскрыта, хотя выбраны все ТТ
  expect(await screen.findByRole("button", { name: new RegExp(free.name) })).toHaveAttribute("aria-expanded", "true");
  expect(show).toHaveBeenCalledWith(expect.stringMatching(/^Заказ № \d+ оформлен$/), expect.objectContaining({ severity: "success" }));
  const created = (await getOrders())[0];
  expect(created).toMatchObject({ storeId: free.id, deliveryDate: freeSlot.deliveryDate, createdBy: { id: 5, name: "Тест Тестов" } });
  expect(screen.getByRole("button", { name: `№ ${created.id}` })).toBeInTheDocument();
});

it("если заказ на эту доставку уже есть, открывает его на изменение", async () => {
  const user = userEvent.setup();
  const { busy, existing } = await weeklyStores();
  const store = renderOrders(`/Orders/new/${WEEKLY}`, ["OrdersTT"]);

  await screen.findByRole("button", { name: "Оформить заказ" });
  await user.click(screen.getByRole("button", { name: "Торговая точка" }));
  await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: busy.name }));

  expect(await screen.findByRole("button", { name: "Сохранить изменения" })).toBeInTheDocument();
  expect(store.getState().pageTitle.title).toBe(`Заказ № ${existing.id}`);
  expect(show).toHaveBeenCalledWith(expect.stringContaining(`заказ № ${existing.id}`), expect.objectContaining({ severity: "info" }));
  // в корзине — состав существующего заказа
  expect(screen.getByText(new RegExp(`^${existing.lines.length} позиц`))).toBeInTheDocument();
});

it("набранную корзину не теряет: о существующем заказе предупреждает и второй не оформляет", async () => {
  const user = userEvent.setup();
  const { busy, existing } = await weeklyStores();
  renderOrders(`/Orders/new/${WEEKLY}`, ["OrdersTT"]);

  const [add] = await screen.findAllByRole("button", { name: /^Добавить «.+» в заказ$/ });
  await user.click(add);
  await user.click(screen.getByRole("button", { name: "Торговая точка" }));
  await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: busy.name }));

  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent(`уже есть заказ № ${existing.id}`);
  expect(screen.getByText("1 позиция")).toBeInTheDocument();
  const before = (await getOrders()).length;
  await user.click(screen.getByRole("button", { name: "Оформить заказ" }));
  expect(await getOrders()).toHaveLength(before);
  expect(show).not.toHaveBeenCalledWith(expect.stringMatching(/оформлен$/), expect.anything());

  await user.click(within(alert).getByRole("button", { name: `Открыть заказ № ${existing.id}` }));
  expect(await screen.findByRole("button", { name: "Сохранить изменения" })).toBeInTheDocument();
});

it("заказ, по которому приём закрыт, на изменение не открывается", async () => {
  const orders = await getOrders();
  const locked = orders.find((order) => !order.cancelledAt && Date.parse(order.closeAt) <= NOW.getTime())!;
  renderOrders(`/Orders/edit/${locked.id}`, ["OrdersTTAdmin"]);

  expect(await screen.findByRole("heading", { name: `Заказ № ${locked.id} уже нельзя изменить` })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Сохранить изменения" })).not.toBeInTheDocument();
});

it("кнопка «+» прибавляет упаковку", async () => {
  const user = userEvent.setup();
  const item = (await getCatalog(1)).items.find((candidate) => candidate.isActive && candidate.forOwn && candidate.forPartner && candidate.step > 1)!;
  renderOrders("/Orders/new/1", ["OrdersTTAdmin"]);

  await user.click(await screen.findByRole("button", { name: `Добавить «${item.name}» в заказ` }));
  // количество видно и в каталоге, и в корзине
  const [inCatalog, inCart] = screen.getAllByRole("textbox", { name: `Количество «${item.name}»` });
  expect(inCatalog).toHaveValue(String(item.step));

  const [plus] = screen.getAllByRole("button", { name: `Увеличить количество «${item.name}»` });
  await user.click(plus);
  await user.click(plus);
  expect(inCatalog).toHaveValue(String(item.step * 3));
  expect(inCart).toHaveValue(String(item.step * 3));

  // ручной ввод округляется до кратности
  await user.clear(inCart);
  await user.type(inCart, `${item.step + 1}{Enter}`);
  expect(inCatalog).toHaveValue(String(item.step));
});

it("настройки доступны только администратору раздела", async () => {
  renderOrders("/Orders/settings", ["OrdersTT"]);
  expect(await screen.findByRole("button", { name: "Новый заказ" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Вкладки заказов" })).not.toBeInTheDocument();
});

it("администратор настраивает вкладки, дни доставки и каталог", async () => {
  const user = userEvent.setup();
  renderOrders("/Orders/settings", ["OrdersTTAdmin"]);

  expect(await screen.findByRole("heading", { name: "Вкладки заказов" })).toBeInTheDocument();
  expect(screen.getByText("Настройки")).toBeInTheDocument();
  expect(screen.getAllByText(/Заказ, оформленный сейчас: приём до/)).toHaveLength(6);

  await user.click(screen.getByRole("button", { name: /Дни доставки/ }));
  expect(await screen.findByRole("heading", { name: "Дни доставки" })).toBeInTheDocument();
  // у еженедельной вкладки сдвиг показывается днём недели
  await user.click(screen.getByRole("button", { name: "День доставки: Парашютная 63" }));
  expect(within(screen.getByRole("listbox")).getByRole("option", { name: "Среда" })).toBeInTheDocument();
  await user.keyboard("{Escape}");

  await user.click(screen.getByRole("button", { name: /Каталог/ }));
  expect(await screen.findByRole("table", { name: "Позиции" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Заморозка/ })).toBeInTheDocument();
});
