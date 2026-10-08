import { configureStore } from "@reduxjs/toolkit";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import DeliveryRequestsPage from "../../Pages/DeliveryMenu/DeliveryRequestsPage";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";

const { api } = vi.hoisted(() => ({
  api: {
    getRequestLocations: vi.fn(),
    blockRestaurant: vi.fn(),
    getBlockStatus: vi.fn(),
    unblockRestaurant: vi.fn(),
    importMenu: vi.fn(),
    loadSales: vi.fn(),
    getOrdersHistory: vi.fn(),
    getOrdersDetails: vi.fn(),
    getOrderLogs: vi.fn(),
    getRequestErrorMessage: (_error: unknown, fallback: string) => fallback,
  },
}));

vi.mock("../../Pages/DeliveryMenu/deliveryRequests.api", () => api);

const LOCATIONS = [
  { guid: "shop-1", name: "Пекарня на Лесной", rkCode: 10, aggregatorsCode: 321 },
  { guid: "shop-2", name: "Пекарня на Садовой", rkCode: 11, aggregatorsCode: 322 },
];

function mount(url = "/Delivery/requests") {
  render(
    <Provider store={configureStore({ reducer: { backButton, pageTitle } })}>
      <MemoryRouter initialEntries={[url]}>
        <DeliveryRequestsPage />
      </MemoryRouter>
    </Provider>,
  );
}

async function pickLocation(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Торговая точка" }));
  // Select дублирует варианты в скрытом нативном select, поэтому выбираем в видимом списке.
  await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Пекарня на Лесной" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getRequestLocations.mockResolvedValue(LOCATIONS);
  api.blockRestaurant.mockResolvedValue({ status: "ok" });
  api.getBlockStatus.mockResolvedValue({ blocks: [] });
  api.getOrdersHistory.mockResolvedValue({ orders: [] });
  api.getOrderLogs.mockResolvedValue([]);
  api.loadSales.mockResolvedValue({ status: "ok" });
});

it("loads blocks and today's orders as soon as a location is picked", async () => {
  const user = userEvent.setup();
  mount();

  expect(await screen.findByText("Выберите торговую точку")).toBeInTheDocument();

  await pickLocation(user);

  await waitFor(() => expect(api.getBlockStatus).toHaveBeenCalledWith({ locationGuid: "shop-1", statuses: [], limit: 100, offset: 0 }));
  await waitFor(() => expect(api.getOrdersHistory).toHaveBeenCalledTimes(1));
  expect(api.getOrdersHistory.mock.calls[0][0]).toMatchObject({ locationGuid: "shop-1", statuses: [], limit: 100, offset: 0 });
  expect(await screen.findByText("Блокировок нет — точка принимает заказы.")).toBeInTheDocument();
  // Отдельный бейдж «Принимает заказы» не нужен — это и так видно по пустому списку блокировок.
  expect(screen.queryByText("Принимает заказы")).not.toBeInTheDocument();
});

it("opens the location from the address without choosing it again", async () => {
  mount("/Delivery/requests?location=shop-2");

  await waitFor(() => expect(api.getBlockStatus).toHaveBeenCalledWith(expect.objectContaining({ locationGuid: "shop-2" })));
  expect(api.getOrdersHistory).toHaveBeenCalledWith(expect.objectContaining({ locationGuid: "shop-2" }));
});

it("blocks a restaurant right away and reloads the block list exactly once", async () => {
  const user = userEvent.setup();
  mount();
  await pickLocation(user);

  await user.click(screen.getByRole("button", { name: "Заблокировать" }));
  const form = await screen.findByRole("dialog", { name: "Новая блокировка" });
  await user.type(within(form).getByLabelText("Причина *"), "Ремонт печи");
  await user.click(within(form).getByRole("button", { name: "Заблокировать" }));

  // Окна подтверждения нет — блокировка уходит сразу.
  expect(screen.queryByRole("dialog", { name: "Заблокировать ресторан в Яндексе?" })).not.toBeInTheDocument();
  await waitFor(() => expect(api.blockRestaurant).toHaveBeenCalledTimes(1));
  expect(api.blockRestaurant.mock.calls[0][0]).toMatchObject({
    locationGuid: "shop-1",
    message: "Ремонт печи",
    to: null,
  });
  // Тег проставляет yeapi — поля в форме нет, в запросе его тоже нет.
  expect(api.blockRestaurant.mock.calls[0][0]).not.toHaveProperty("tag");
  // Список перечитывается один раз (с небольшой задержкой, пока Яндекс не отдаст новую блокировку); сообщения нет.
  await waitFor(() => expect(api.getBlockStatus).toHaveBeenCalledTimes(2), { timeout: 4000 });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  expect(api.getBlockStatus).toHaveBeenCalledTimes(2);
  expect(screen.queryByText(/Блокировка отправлена/)).not.toBeInTheDocument();
}, 10_000);

it("keeps the reason required and does not send the block without it", async () => {
  const user = userEvent.setup();
  mount();
  await pickLocation(user);

  await user.click(screen.getByRole("button", { name: "Заблокировать" }));
  const form = await screen.findByRole("dialog", { name: "Новая блокировка" });
  await user.click(within(form).getByRole("button", { name: "Заблокировать" }));

  expect(await within(form).findByText("Укажите причину блокировки.")).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Заблокировать ресторан в Яндексе?" })).not.toBeInTheDocument();
  expect(api.blockRestaurant).not.toHaveBeenCalled();
});

it("shows active blocks, marks the location as blocked and lifts the selected one", async () => {
  api.getBlockStatus.mockResolvedValue({ blocks: [{ blockId: "b-1", status: "active", reason: "Ремонт" }] });
  api.unblockRestaurant.mockResolvedValue({ status: "ok" });
  const user = userEvent.setup();
  mount();
  await pickLocation(user);

  expect(await screen.findByText("b-1")).toBeInTheDocument();
  expect(screen.getByText("Заблокирована")).toBeInTheDocument();
  expect(screen.getByText("Действует")).toBeInTheDocument();

  await user.click(screen.getByRole("checkbox", { name: "Выбрать b-1" }));
  await user.click(screen.getByRole("button", { name: "Снять (1)" }));

  const dialog = await screen.findByRole("dialog", { name: "Снять блокировку?" });
  await user.click(within(dialog).getByRole("button", { name: "Снять блокировку" }));

  await waitFor(() => expect(api.unblockRestaurant).toHaveBeenCalledWith({ locationGuid: "shop-1", blockIds: ["b-1"] }));
});

it("filters orders by status and opens the details of a clicked order", async () => {
  api.getOrdersHistory.mockResolvedValue({
    orders: [
      { created_at: "2026-09-22T13:04:33", eats_id: "260922-1584251", items_cost: 289, status: "DELIVERED", origin_id: "guid" },
      { created_at: "2026-09-22T12:59:31", eats_id: "260922-1637426", items_cost: 618, status: "CANCELLED", origin_id: "guid" },
    ],
  });
  api.getOrdersDetails.mockResolvedValue({ orders: [{ eats_id: "260922-1584251", status: "DELIVERED" }] });
  const user = userEvent.setup();
  mount();
  await pickLocation(user);

  const orders = await screen.findByRole("region", { name: /Заказы/ });
  expect(await within(orders).findByText("260922-1637426")).toBeInTheDocument();
  expect(within(orders).getByText("289 ₽")).toBeInTheDocument();
  expect(within(orders).queryByText("origin_id")).not.toBeInTheDocument();

  await user.click(within(orders).getByRole("button", { name: /Доставлен/ }));
  expect(within(orders).queryByText("260922-1637426")).not.toBeInTheDocument();

  await user.click(within(orders).getByRole("row", { name: "Детали заказа 260922-1584251" }));
  await waitFor(() => expect(api.getOrdersDetails).toHaveBeenCalledWith({ eatsIds: ["260922-1584251"] }));
  expect(await screen.findByRole("dialog", { name: "Заказ 260922-1584251" })).toBeInTheDocument();
});

it("shows the order as a card with its items instead of raw JSON", async () => {
  api.getOrdersHistory.mockResolvedValue({ orders: [{ eats_id: "260922-1584251", status: "DELIVERED" }] });
  api.getOrdersDetails.mockResolvedValue({
    orders: [{
      eats_id: "260922-1584251",
      status: "DELIVERED",
      delivery_type: "native",
      items: [
        { name: "Брауни", id: "832206", quantity: 0, base_price: 114, modifications: [] },
        { name: "Цыпленок по-азиатски", id: "850055", quantity: 2, base_price: 289, modifications: [{ name: "Соус терияки", quantity: 1, price: 30 }] },
      ],
    }],
  });
  const user = userEvent.setup();
  mount();
  await pickLocation(user);

  await user.click(await screen.findByRole("row", { name: "Детали заказа 260922-1584251" }));
  const dialog = await screen.findByRole("dialog", { name: "Заказ 260922-1584251" });

  expect(await within(dialog).findByText("Состав заказа")).toBeInTheDocument();
  expect(within(dialog).getByText("Цыпленок по-азиатски")).toBeInTheDocument();
  expect(within(dialog).getByText(/Соус терияки/)).toBeInTheDocument();
  expect(within(dialog).getByText("не в заказе (0 шт.)")).toBeInTheDocument();
  // Цена позиции — уже сумма за оба блюда: 289 + модификатор 30, без умножения на количество.
  expect(within(dialog).getAllByText("319 ₽").length).toBeGreaterThan(0);
  expect(within(dialog).queryByText(`${(638).toLocaleString("ru-RU")} ₽`)).not.toBeInTheDocument();
  expect(within(dialog).queryByRole("columnheader", { name: "Цена" })).not.toBeInTheDocument();
  expect(within(dialog).getByText("Доставка")).toBeInTheDocument();
  expect(within(dialog).queryByText(/"items"/)).not.toBeInTheDocument();
});

it("blocks every available location at once and reports each of them", async () => {
  const user = userEvent.setup();
  mount();
  await screen.findByText("Выберите торговую точку");

  await user.click(screen.getByRole("button", { name: "Заблокировать" }));
  const form = await screen.findByRole("dialog", { name: "Новая блокировка" });
  await user.click(within(form).getByRole("button", { name: "Все · 2" }));
  await user.type(within(form).getByLabelText("Причина *"), "Проверка кассы");
  await user.click(within(form).getByRole("button", { name: "Заблокировать (2)" }));


  await waitFor(() => expect(api.blockRestaurant).toHaveBeenCalledTimes(2));
  expect(api.blockRestaurant.mock.calls.map((call) => call[0].locationGuid).sort()).toEqual(["shop-1", "shop-2"]);
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Новая блокировка" })).not.toBeInTheDocument());
  expect(screen.queryByText(/Блокировка отправлена/)).not.toBeInTheDocument();
});

it("keeps the bulk dialog open with failed locations and retries only them", async () => {
  api.importMenu
    .mockResolvedValueOnce({ status: "ok" })
    .mockRejectedValueOnce(new Error("boom"))
    .mockResolvedValueOnce({ status: "ok" });
  const user = userEvent.setup();
  mount();
  await screen.findByText("Выберите торговую точку");

  await user.click(screen.getByRole("button", { name: "Импорт меню" }));
  const dialog = await screen.findByRole("dialog", { name: "Импорт меню" });
  await user.click(within(dialog).getByRole("button", { name: "Все · 2" }));
  await user.click(within(dialog).getByRole("button", { name: "Запустить импорт (2)" }));
  await user.click(within(await screen.findByRole("dialog", { name: "Запустить импорт меню?" })).getByRole("button", { name: "Запустить" }));

  expect(await within(dialog).findByText("Ошибок: 1")).toBeInTheDocument();
  expect(within(dialog).getByText("Не удалось запустить импорт меню.")).toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Повторить для ошибок (1)" }));
  await waitFor(() => expect(api.importMenu).toHaveBeenCalledTimes(3));
  expect(await within(dialog).findByText("Запущено: 1")).toBeInTheDocument();
});

it("requests an order by number when it is not among the loaded ones", async () => {
  api.getOrdersDetails.mockResolvedValue({ orders: [] });
  const user = userEvent.setup();
  mount();
  await pickLocation(user);
  await waitFor(() => expect(api.getOrdersHistory).toHaveBeenCalled());

  await user.type(screen.getByRole("searchbox", { name: "Номер заказа" }), "240101-123456{Enter}");

  await waitFor(() => expect(api.getOrdersDetails).toHaveBeenCalledWith({ eatsIds: ["240101-123456"] }));
});

it("lets you pick locations by search for a bulk menu import", async () => {
  api.importMenu.mockResolvedValue({ status: "ok" });
  const user = userEvent.setup();
  mount();
  await screen.findByText("Выберите торговую точку");

  await user.click(screen.getByRole("button", { name: "Импорт меню" }));
  const dialog = await screen.findByRole("dialog", { name: "Импорт меню" });
  expect(within(dialog).getByText("Выбрано 0")).toBeInTheDocument();

  await user.type(within(dialog).getByRole("searchbox", { name: "Найти точку" }), "Садов");
  expect(within(dialog).queryByRole("checkbox", { name: "Пекарня на Лесной" })).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Выбрать найденные" }));
  expect(within(dialog).getByText("Выбрано 1")).toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Запустить импорт" }));
  await waitFor(() => expect(api.importMenu).toHaveBeenCalledWith({ locationGuid: "shop-2", operationType: "menu" }));
});

it("imports stop lists with a fixed operation type the user cannot edit", async () => {
  api.importMenu.mockResolvedValue({ status: "ok" });
  const user = userEvent.setup();
  mount();
  await pickLocation(user);

  await user.click(screen.getByRole("button", { name: "Импорт стоп-листов" }));
  const dialog = await screen.findByRole("dialog", { name: "Импорт стоп-листов" });
  expect(within(dialog).queryByLabelText(/Тип операции/)).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Запустить импорт" }));

  await waitFor(() => expect(api.importMenu).toHaveBeenCalledWith({ locationGuid: "shop-1", operationType: "menu_stop_list" }));
});

it("shows the yeapi request log of a clicked order next to its contents", async () => {
  api.getOrdersHistory.mockResolvedValue({ orders: [{ eats_id: "260922-1637426", status: "CANCELLED" }] });
  api.getOrdersDetails.mockResolvedValue({ orders: [{ eats_id: "260922-1637426", status: "CANCELLED" }] });
  api.getOrderLogs.mockResolvedValue([
    {
      id: 203,
      type: "DELETE",
      clientId: "yandex_eda",
      ipAddress: "10.140.0.175",
      url: "/order/260922-1637426",
      body: "{\"eatsId\":\"260922-1637426\",\"comment\":\"\"}",
      datetimeBegin: "2026-09-22T13:03:01.62",
      datetimeEnd: "2026-09-22T13:03:01.62",
      statusCode: 400,
      errorText: "{\"title\":\"One or more validation errors occurred.\",\"errors\":{\"Platform\":[\"The Platform field is required.\"]}}",
      order: "260922-1637426",
    },
    {
      id: 189,
      type: "POST",
      clientId: "yandex_eda",
      ipAddress: "10.140.0.175",
      url: "/order",
      body: "{\"eatsId\":\"260922-1637426\"}",
      datetimeBegin: "2026-09-22T12:59:36.137",
      datetimeEnd: "2026-09-22T12:59:36.153",
      statusCode: 200,
      errorText: null,
      order: "260922-1637426",
    },
  ]);
  const user = userEvent.setup();
  mount();
  await pickLocation(user);

  await user.click(await screen.findByRole("row", { name: "Детали заказа 260922-1637426" }));
  const dialog = await screen.findByRole("dialog", { name: "Заказ 260922-1637426" });
  expect(api.getOrderLogs).toHaveBeenCalledWith("260922-1637426");

  const log = await within(dialog).findByRole("region", { name: "Журнал запросов" });
  const entries = within(log).getAllByRole("listitem").filter((item) => item.tagName === "LI" && item.parentElement?.tagName === "OL");
  // Хронологически: сначала создание, потом неудачная отмена.
  expect(entries[0]).toHaveTextContent("Создание заказа");
  expect(entries[1]).toHaveTextContent("Отмена заказа");
  expect(within(log).getByText("Ошибок: 1")).toBeInTheDocument();
  expect(within(log).getByText("Platform: The Platform field is required.")).toBeInTheDocument();

  await user.click(within(entries[1]).getByRole("button"));
  expect(within(entries[1]).getByText("Тело запроса")).toBeInTheDocument();
  expect(within(entries[1]).getByText("10.140.0.175")).toBeInTheDocument();
});

it("keeps the order contents visible when the log service fails", async () => {
  api.getOrdersHistory.mockResolvedValue({ orders: [{ eats_id: "260922-1584251", status: "DELIVERED" }] });
  api.getOrdersDetails.mockResolvedValue({ orders: [{ eats_id: "260922-1584251", status: "DELIVERED", items: [{ name: "Брауни", quantity: 1, base_price: 114 }] }] });
  api.getOrderLogs.mockRejectedValue(new Error("down"));
  const user = userEvent.setup();
  mount();
  await pickLocation(user);

  await user.click(await screen.findByRole("row", { name: "Детали заказа 260922-1584251" }));
  const dialog = await screen.findByRole("dialog", { name: "Заказ 260922-1584251" });

  expect(await within(dialog).findByText("Брауни")).toBeInTheDocument();
  expect(await within(dialog).findByText("Не удалось получить логи заказа.")).toBeInTheDocument();
});

it("loads Yandex sales for the chosen day without choosing a location", async () => {
  const user = userEvent.setup();
  mount();

  await user.click(await screen.findByRole("button", { name: "Подгрузить продажи" }));
  const dialog = await screen.findByRole("dialog", { name: "Подгрузить продажи" });
  const dateInput = within(dialog).getByLabelText("Дата продаж *");
  await user.clear(dateInput);
  await user.type(dateInput, "2026-09-20");
  await user.click(within(dialog).getByRole("button", { name: "Подгрузить" }));

  await waitFor(() => expect(api.loadSales).toHaveBeenCalledWith("2026-09-20"));
  expect(await screen.findByRole("status")).toHaveTextContent("Продажи за 20.09.2026 подгружены.");
});
