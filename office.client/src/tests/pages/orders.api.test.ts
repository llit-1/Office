import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../Services/api";
import {
  getCatalog,
  getOrderContents,
  getOrderLines,
  getOrders,
  getOrdersBootstrap,
  getOrdersErrorMessage,
  saveItem,
  saveOrder,
} from "../../Pages/Orders/orders.api";
import { createFakeServer, DAILY, STORE_A, STORE_B, WEEKLY, type FakeServer } from "./orders.fakeServer";

const { api } = vi.hoisted(() => ({ api: { server: null as unknown as FakeServer } }));
vi.mock("../../Services/api", async () => ({
  ...(await vi.importActual<typeof import("../../Services/api")>("../../Services/api")),
  get: (url: string, config?: { params?: Record<string, unknown> }) => api.server.get(url, config),
  post: (url: string, body?: unknown) => api.server.post(url, body),
  put: (url: string, body?: unknown) => api.server.put(url, body),
}));

// четверг, 8 октября 2026, 14:00 по Москве
const NOW = Date.parse("2026-10-08T14:00:00+03:00");
let server: FakeServer;

beforeEach(() => {
  server = createFakeServer(() => NOW);
  api.server = server;
});

const lastCall = () => server.calls[server.calls.length - 1];

describe("вход в раздел", () => {
  it("получает типы заказов и торговые точки пользователя одним запросом", async () => {
    expect(await getOrdersBootstrap()).toEqual({
      rules: [{ id: DAILY, name: "Регулярный (Завтра)", hasItems: true }, { id: WEEKLY, name: "Еженедельный", hasItems: true }],
      stores: [
        { guid: STORE_A, name: "Парашютная 63" },
        { guid: STORE_B, name: "Невский 87" },
        { guid: expect.any(String), name: "Тореза 9" },
      ],
    });
    expect(server.calls).toEqual([{ method: "GET", url: "/Order/rules", params: undefined }]);
  });

  it("тип без доступных пользователю позиций помечается пустым", async () => {
    server.items.find((item) => item.ruleId === WEEKLY)!.avaliableForNative = 0;
    server.setRole("Order_woman");
    expect((await getOrdersBootstrap()).rules.map((rule) => [rule.id, rule.hasItems])).toEqual([[DAILY, true], [WEEKLY, false]]);
    // старый сервер без списка доступных правил — показываем все типы
    api.server = { ...server, get: async () => ({ locations: [], rules: [{ id: 1, name: "Тип" }] }) } as unknown as FakeServer;
    expect((await getOrdersBootstrap()).rules).toEqual([{ id: 1, name: "Тип", hasItems: true }]);
  });
});

describe("список заказов", () => {
  it("по всем точкам торговая точка не передаётся, по одной — передаётся её guid", async () => {
    await getOrders(DAILY, null);
    expect(lastCall()).toMatchObject({ url: `/Order/rules/${DAILY}/orders`, params: undefined });
    await getOrders(DAILY, STORE_B);
    expect(lastCall()).toMatchObject({ url: `/Order/rules/${DAILY}/orders`, params: { locationGuid: STORE_B } });
  });

  it("заказы приходят по торговым точкам: кто оформил, когда формирование и доставка", async () => {
    const [nearest] = server.occurrences(DAILY, 1);
    const saved = server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: nearest, lines: [{ id: 2, quantity: 36 }, { id: 1, quantity: 6 }] });

    expect(await getOrders(DAILY, null)).toEqual([{
      store: { guid: STORE_A, name: "Парашютная 63" },
      orders: [{
        id: saved.id,
        ruleId: DAILY,
        storeGuid: STORE_A,
        storeName: "Парашютная 63",
        creationDateTime: "2026-10-09T12:00:00",
        shipmentDateTime: "2026-10-10T00:00:00",
        userName: "Анна Морозова",
        lines: [
          { itemId: 1, rkcode: 100, name: "Багет зерновой", step: 6, quantity: 6 },
          { itemId: 2, rkcode: 101, name: "Булочка заварная", step: 12, quantity: 36 },
        ],
      }],
    }]);
  });

  it("состав заказа запрашивается отдельно; без количества от сервера оно неизвестно", async () => {
    const [nearest] = server.occurrences(DAILY, 1);
    const saved = server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: nearest, lines: [{ id: 4, quantity: 20 }] });
    expect(await getOrderLines(saved.id)).toEqual([{ itemId: 4, rkcode: 200, name: "Морс клюквенный", step: 10, quantity: 20 }]);
    expect(lastCall().url).toBe(`/Order/orders/${saved.id}/items`);

    // сервер, который ещё не отдаёт количество
    api.server = { ...server, get: async () => [{ ...server.items[3] }] } as unknown as FakeServer;
    expect((await getOrderLines(saved.id))[0].quantity).toBeNull();
  });
});

describe("редактор заказа", () => {
  it("без даты сервер отдаёт ближайшую: даты на выбор, доставку и каталог точки", async () => {
    const contents = await getOrderContents(DAILY, STORE_A);
    expect(lastCall()).toMatchObject({ url: `/Order/rules/${DAILY}/locations/${STORE_A}/contents`, params: undefined });
    // одна уже прошедшая дата и семь будущих — каждая со своей доставкой
    expect(contents.dates).toHaveLength(8);
    expect(contents.dates.slice(0, 3)).toEqual([
      { creationDateTime: "2026-10-08T12:00:00", shipmentDateTime: "2026-10-09T00:00:00" },
      { creationDateTime: "2026-10-09T12:00:00", shipmentDateTime: "2026-10-10T00:00:00" },
      { creationDateTime: "2026-10-10T12:00:00", shipmentDateTime: "2026-10-11T00:00:00" },
    ]);
    expect(contents.creationDateTime).toBe("2026-10-09T12:00:00");
    expect(contents.shipmentDateTime).toBe("2026-10-10T00:00:00");
    expect(contents.lines).toEqual([]);
    // выключенных позиций в каталоге для заказа нет
    expect(contents.groups.map((group) => [group.name, group.items.map((item) => item.name)])).toEqual([
      ["Заморозка", ["Багет зерновой", "Булочка заварная"]],
      ["Напитки", ["Морс клюквенный", "Сок яблочный"]],
    ]);
    // доставку, которую сервер посчитать не смог (DateTime.MinValue), в выбор не пускаем
    api.server = { ...server, get: async () => ({
      dateTimeMatches: [{ orderCreationDateTime: ["2026-10-09T12:00:00", "2026-10-10T12:00:00"], orderShipmentDateTime: ["0001-01-01T00:00:00", "2026-10-11T00:00:00"] }],
      itemGroups: [], orderCreationDateTime: "2026-10-10T12:00:00", orderShipmentDateTime: "2026-10-11T00:00:00", orderItems: [],
    }) } as unknown as FakeServer;
    expect((await getOrderContents(DAILY, STORE_A)).dates).toEqual([{ creationDateTime: "2026-10-10T12:00:00", shipmentDateTime: "2026-10-11T00:00:00" }]);
    api.server = server;
    // роли «Собственное управление» сервер отдаёт только её позиции
    server.setRole("Order_woman");
    expect((await getOrderContents(DAILY, STORE_A)).groups.flatMap((group) => group.items.map((item) => item.name))).not.toContain("Сок яблочный");
  });

  it("для выбранной даты возвращает её доставку и уже оформленный заказ", async () => {
    const date = "2026-10-12T12:00:00";
    server.addOrder({ ruleId: DAILY, locationGuid: STORE_A, creationDateTime: date, lines: [{ id: 1, quantity: 12 }] });
    const contents = await getOrderContents(DAILY, STORE_A, date);
    expect(lastCall().params).toEqual({ creationDateTime: date });
    expect(contents.creationDateTime).toBe(date);
    expect(contents.shipmentDateTime).toBe("2026-10-13T00:00:00");
    expect(contents.lines).toEqual([expect.objectContaining({ itemId: 1, quantity: 12 })]);
  });

  it("сохранение отправляет дату, точку, тип и позиции с количеством — и ничего о пользователе", async () => {
    const id = await saveOrder({ ruleId: DAILY, storeGuid: STORE_A, creationDateTime: "2026-10-09T12:00:00", lines: [{ itemId: 2, quantity: 24 }, { itemId: 4, quantity: 10 }] });
    expect(lastCall()).toEqual({
      method: "POST",
      url: "/Order/orders",
      body: { creationDateTime: "2026-10-09T12:00:00", locationGuid: STORE_A, ruleId: DAILY, items: [{ id: 2, quantity: 24 }, { id: 4, quantity: 10 }] },
    });
    expect(server.orders).toEqual([expect.objectContaining({ id, userName: "Тест Тестов", lines: [{ id: 2, quantity: 24 }, { id: 4, quantity: 10 }] })]);

    // повторное сохранение на ту же дату меняет тот же заказ
    expect(await saveOrder({ ruleId: DAILY, storeGuid: STORE_A, creationDateTime: "2026-10-09T12:00:00", lines: [{ itemId: 1, quantity: 6 }] })).toBe(id);
    expect(server.orders).toHaveLength(1);
  });

  it("причину отказа объясняет сервер", async () => {
    const closed = saveOrder({ ruleId: DAILY, storeGuid: STORE_A, creationDateTime: server.previous(DAILY), lines: [{ itemId: 1, quantity: 6 }] });
    await expect(closed).rejects.toBeInstanceOf(ApiError);
    expect(getOrdersErrorMessage(await closed.catch((error: unknown) => error), "запасной текст")).toBe("Приём изменений по этому заказу уже закрыт.");
    expect(getOrdersErrorMessage(new ApiError("Forbidden", 403), "запасной текст")).toBe("Нет доступа к этой торговой точке или действию.");
    expect(getOrdersErrorMessage(new Error("сеть"), "запасной текст")).toBe("запасной текст");
  });
});

describe("настройки: каталог", () => {
  it("каталог типа приходит по группам вместе с выключенными позициями", async () => {
    const catalog = await getCatalog(DAILY);
    expect(lastCall().url).toBe(`/Order/rules/${DAILY}/items`);
    expect(catalog.map((group) => group.name)).toEqual(["Заморозка", "Напитки"]);
    expect(catalog[0].items.find((item) => item.name === "Круассан")).toEqual({
      id: 3, ruleId: DAILY, groupId: 1, rkcode: 102, name: "Круассан", step: 1, forOwn: true, isActive: false,
    });
  });

  it("новая позиция создаётся, существующая сохраняется целиком", async () => {
    const created = await saveItem({ id: 0, ruleId: DAILY, groupId: 2, rkcode: 201, name: "Сок", step: 6, forOwn: true, isActive: true });
    expect(lastCall()).toMatchObject({
      method: "POST",
      url: "/Order/items",
      body: { rkcode: 201, name: "Сок", step: 6, groupId: 2, ruleId: DAILY, avaliableForNative: 1, actual: 1 },
    });
    expect(created.id).toBeGreaterThan(0);

    const saved = await saveItem({ ...created, isActive: false });
    expect(lastCall()).toMatchObject({ method: "PUT", url: `/Order/items/${created.id}`, body: { name: "Сок", actual: 0 } });
    expect(saved).toEqual({ ...created, isActive: false });
  });
});
