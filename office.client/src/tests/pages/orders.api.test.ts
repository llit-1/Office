import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cancelOrder,
  deleteGroup,
  getCatalog,
  getOrders,
  getOrdersBootstrap,
  patchItems,
  saveOrder,
  saveOrderType,
  setDeliveryDay,
  type Actor,
} from "../../Pages/Orders/orders.api";
import { resetDb } from "../../Pages/Orders/orders.mock";
import { findStoreOffset, getPermissions, isItemAvailable, mskMoment, resolveSlot, toOrderLine } from "../../Pages/Orders/orders.rules";
import type { OrderDraft } from "../../Pages/Orders/orders.types";

// четверг, 8 октября 2026, 14:00 по Москве
const NOW = new Date(mskMoment("2026-10-08", "14:00"));
const user: Actor = { user: { id: 1, name: "Тест Тестов" }, permissions: getPermissions(["OrdersTT"]) };
const admin: Actor = { user: { id: 2, name: "Админ" }, permissions: getPermissions(["OrdersTTAdmin"]) };

const IN_THREE_DAYS = 3;
const WEEKLY = 4;
// у этой ТТ в демо-данных нет регулярных заказов
const QUIET_STORE = 13;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  resetDb(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

async function draftFor(typeId: number, storeId: number, count = 2): Promise<OrderDraft> {
  const base = await getOrdersBootstrap();
  const store = base.stores.find((candidate) => candidate.id === storeId)!;
  const catalog = await getCatalog(typeId);
  const lines = catalog.items
    .filter((item) => isItemAvailable(item, store))
    .slice(0, count)
    .map((item) => toOrderLine(item, catalog.groups.find((group) => group.id === item.groupId), item.step));
  return { id: null, typeId, storeId, lines };
}

/** ТТ, у которой на ближайшую доставку вкладки ещё нет заказа. */
async function freeStore(typeId: number) {
  const [base, orders] = await Promise.all([getOrdersBootstrap(), getOrders()]);
  const type = base.types.find((candidate) => candidate.id === typeId)!;
  return base.stores.find((store) => {
    const slot = resolveSlot(type, findStoreOffset(base.deliveryDays, typeId, store.id), NOW)!;
    return !store.closed && !orders.some((order) => order.typeId === typeId && order.storeId === store.id && order.deliveryDate === slot.deliveryDate && !order.cancelledAt);
  })!;
}

describe("демо-данные", () => {
  it("шесть вкладок, регулярный ассортимент разнесён по сроку доставки", async () => {
    const base = await getOrdersBootstrap();
    expect(base.types.map((type) => type.name)).toEqual([
      "Регулярный (Завтра)", "Регулярный (Послезавтра)", "Регулярный (Через 3 дня)", "Еженедельный", "Ежемесячный", "Ценники",
    ]);
    const groupNames = async (typeId: number) => (await getCatalog(typeId)).groups.map((group) => group.name);
    expect(await groupNames(1)).toContain("Заморозка");
    expect(await groupNames(2)).toEqual(expect.arrayContaining(["Кулинария", "Печенье СБ"]));
    expect(await groupNames(3)).toEqual(["Фреш длительного цикла выпуска", "Хлеба за три дня"]);
  });

  it("на одну доставку у ТТ не больше одного действующего заказа", async () => {
    const [base, orders] = await Promise.all([getOrdersBootstrap(), getOrders()]);
    for (const type of base.types) expect(orders.some((order) => order.typeId === type.id)).toBe(true);
    const keys = orders.filter((order) => !order.cancelledAt).map((order) => `${order.typeId}|${order.storeId}|${order.deliveryDate}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("оформление заказа", () => {
  it("дату доставки и срок правок считает сервер по расписанию вкладки", async () => {
    const result = await saveOrder(await draftFor(IN_THREE_DAYS, QUIET_STORE), user);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order).toMatchObject({
      storeId: QUIET_STORE,
      deliveryDate: "2026-10-11",
      closeAt: new Date(mskMoment("2026-10-08", "17:00")).toISOString(),
      createdBy: user.user,
    });
  });

  it("второй заказ на ту же доставку не принимает", async () => {
    const first = await saveOrder(await draftFor(IN_THREE_DAYS, QUIET_STORE), user);
    if (!first.ok) throw new Error(first.message);
    const second = await saveOrder(await draftFor(IN_THREE_DAYS, QUIET_STORE), user);
    expect(second).toEqual({ ok: false, message: expect.stringContaining(`уже есть заказ № ${first.order.id}`) });

    // после закрытия приёма новая доставка — новый заказ
    vi.setSystemTime(new Date(mskMoment("2026-10-08", "17:30")));
    const next = await saveOrder(await draftFor(IN_THREE_DAYS, QUIET_STORE), user);
    expect(next).toMatchObject({ ok: true, order: { deliveryDate: "2026-10-12" } });
  });

  it("требует торговую точку и хотя бы одну позицию", async () => {
    const draft = await draftFor(IN_THREE_DAYS, QUIET_STORE);
    expect(await saveOrder({ ...draft, storeId: 0 }, user)).toMatchObject({ ok: false });
    expect(await saveOrder({ ...draft, lines: [] }, user)).toMatchObject({ ok: false });
  });

  it("еженедельному заказу ставит день недели торговой точки", async () => {
    const base = await getOrdersBootstrap();
    const store = await freeStore(WEEKLY);
    const offset = findStoreOffset(base.deliveryDays, WEEKLY, store.id)!;
    const result = await saveOrder(await draftFor(WEEKLY, store.id), user);
    // понедельник следующей недели — 12 октября
    expect(result).toMatchObject({ ok: true, order: { deliveryDate: `2026-10-${12 + offset}` } });
  });
});

describe("изменение и отмена", () => {
  it("состав меняется до закрытия приёма и не меняется после", async () => {
    const draft = await draftFor(IN_THREE_DAYS, QUIET_STORE, 3);
    const created = await saveOrder(draft, user);
    if (!created.ok) throw new Error(created.message);
    const [kept] = created.order.lines;

    const updated = await saveOrder({ ...draft, id: created.order.id, lines: [{ ...kept, quantity: kept.quantity * 2 }] }, user);
    expect(updated).toMatchObject({ ok: true, order: { deliveryDate: created.order.deliveryDate, lines: [{ quantity: kept.quantity * 2 }] } });

    vi.setSystemTime(new Date(mskMoment("2026-10-08", "17:01")));
    const late = await saveOrder({ ...draft, id: created.order.id, lines: [kept] }, admin);
    expect(late).toEqual({ ok: false, message: expect.stringContaining("уже закрыт") });
  });

  it("отменённый заказ остаётся в списке и освобождает доставку", async () => {
    const created = await saveOrder(await draftFor(IN_THREE_DAYS, QUIET_STORE), user);
    if (!created.ok) throw new Error(created.message);
    expect(await cancelOrder(created.order.id, user)).toMatchObject({ cancelledBy: user.user });
    expect((await getOrders()).some((order) => order.id === created.order.id)).toBe(true);
    await expect(cancelOrder(created.order.id, user)).rejects.toThrow(/нельзя отменить/);
    expect(await saveOrder(await draftFor(IN_THREE_DAYS, QUIET_STORE), user)).toMatchObject({ ok: true });
  });
});

describe("настройки", () => {
  it("доступны только администратору и проверяют расписание", async () => {
    const base = await getOrdersBootstrap();
    const type = base.types[IN_THREE_DAYS - 1];
    await expect(saveOrderType({ ...type, isActive: false }, user)).rejects.toThrow(/Недостаточно прав/);
    await expect(saveOrderType({ ...type, closeCron: "0 25 * * *" }, admin)).rejects.toThrow(/час/);

    await saveOrderType({ ...type, isActive: false }, admin);
    expect(await saveOrder(await draftFor(IN_THREE_DAYS, QUIET_STORE), user)).toMatchObject({ ok: false });
  });

  it("новый день доставки ТТ действует на следующий же заказ", async () => {
    const store = await freeStore(WEEKLY);
    await setDeliveryDay(WEEKLY, store.id, 4, admin);
    expect(await saveOrder(await draftFor(WEEKLY, store.id), user)).toMatchObject({ ok: true, order: { deliveryDate: "2026-10-16" } });

    await cancelOrder((await getOrders())[0].id, user);
    await setDeliveryDay(WEEKLY, store.id, null, admin);
    // без своего дня — день якоря, понедельник
    expect(await saveOrder(await draftFor(WEEKLY, store.id), user)).toMatchObject({ ok: true, order: { deliveryDate: "2026-10-12" } });
  });

  it("выключенная позиция пропадает из доступных, непустая группа не удаляется", async () => {
    const catalog = await getCatalog(1);
    const item = catalog.items.find((candidate) => candidate.isActive)!;
    await patchItems([item.id], { isActive: false }, admin);
    expect((await getCatalog(1)).items.find((candidate) => candidate.id === item.id)?.isActive).toBe(false);
    await expect(deleteGroup(item.groupId, admin)).rejects.toThrow(/В группе есть позиции/);
  });
});
