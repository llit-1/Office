import { describe, expect, it } from "vitest";
import {
  anchorWeekday,
  canCancelOrder,
  canEditOrder,
  cronError,
  cronNext,
  getOrderStatus,
  getPermissions,
  mskMoment,
  mskToday,
  normalizeQuantity,
  orderTotals,
  quantityBounds,
  resolveSlot,
} from "../../Pages/Orders/orders.rules";
import type { Order, OrderLine, OrderTypeConfig } from "../../Pages/Orders/orders.types";

const type = (closeCron: string, deliveryCron: string, offsetDays: number): OrderTypeConfig =>
  ({ id: 1, name: "Вкладка", isActive: true, closeCron, deliveryCron, offsetDays });

const tomorrow = type("0 12 * * *", "0 0 * * *", 1);
const afterTomorrow = type("0 12 * * *", "0 0 * * *", 2);
const inThreeDays = type("0 17 * * *", "0 0 * * *", 3);
const weekly = type("0 0 * * 1", "0 0 * * 1", 0);
const monthly = type("0 0 1 * *", "0 0 16-22 * 1", 0);
const prices = type("0 0 1 * *", "0 0 L * *", 0);

// четверг, 8 октября 2026
const at = (mskTime: string, day = "2026-10-08") => new Date(mskMoment(day, mskTime));
const user = getPermissions(["OrdersTT"]);
const admin = getPermissions(["OrdersTTAdmin"]);

const line = (patch: Partial<OrderLine> = {}): OrderLine =>
  ({ productId: 1, article: "1", name: "Позиция", groupName: "Группа", quantity: 12, step: 12, price: 10, ...patch });

const order = (patch: Partial<Order> = {}): Order => ({
  id: 1, typeId: 1, storeId: 1, storeName: "ТТ", deliveryDate: "2026-10-10", closeAt: new Date(mskMoment("2026-10-09", "12:00")).toISOString(),
  lines: [line()], createdAt: "2026-10-08T06:00:00Z", createdBy: { id: 1, name: "А" }, cancelledAt: null, cancelledBy: null, ...patch,
});

describe("крон", () => {
  it("считает ближайшее срабатывание по московскому времени", () => {
    expect(cronNext("0 12 * * *", at("11:59").getTime())).toBe(mskMoment("2026-10-08", "12:00"));
    // момент срабатывания сам в «после» не входит, пока не попросили включительно
    expect(cronNext("0 12 * * *", at("12:00").getTime())).toBe(mskMoment("2026-10-09", "12:00"));
    expect(cronNext("0 12 * * *", at("12:00").getTime(), true)).toBe(mskMoment("2026-10-08", "12:00"));
    expect(cronNext("*/15 * * * *", at("14:07").getTime())).toBe(mskMoment("2026-10-08", "14:15"));
    // 23:30 по Гринвичу — уже следующий день по Москве
    expect(mskToday(new Date("2026-10-08T23:30:00Z"))).toBe("2026-10-09");
  });

  it("понимает дни недели, последний день месяца и списки", () => {
    expect(cronNext("0 0 * * 1", at("14:00").getTime())).toBe(mskMoment("2026-10-12", "00:00"));
    expect(cronNext("0 0 * * 7", at("14:00").getTime())).toBe(mskMoment("2026-10-11", "00:00"));
    expect(cronNext("0 0 L * *", at("14:00").getTime())).toBe(mskMoment("2026-10-31", "00:00"));
    expect(cronNext("0 0 L 2 *", at("14:00").getTime())).toBe(mskMoment("2027-02-28", "00:00"));
    expect(cronNext("0 9 1,15 * *", at("14:00").getTime())).toBe(mskMoment("2026-10-15", "09:00"));
  });

  it("день месяца и день недели сочетает через «И»", () => {
    // ближайшая пятница, 13-е
    expect(cronNext("0 0 13 * 5", at("14:00").getTime())).toBe(mskMoment("2026-11-13", "00:00"));
    // понедельник недели, в которой есть 22-е число
    expect(cronNext("0 0 16-22 * 1", at("14:00").getTime())).toBe(mskMoment("2026-10-19", "00:00"));
  });

  it("объясняет ошибки в выражении", () => {
    expect(cronError("0 12 * * *")).toBeNull();
    expect(cronError("0 0 L * *")).toBeNull();
    expect(cronError("0 12 * *")).toMatch(/пять полей/);
    expect(cronError("61 * * * *")).toMatch(/минута/);
    expect(cronError("0 0 * * пн")).toMatch(/день недели/);
  });
});

describe("дата доставки — одна формула на все вкладки", () => {
  it("регулярные: до закрытия приёма — через свой срок, после — на день позже", () => {
    expect(resolveSlot(tomorrow, null, at("11:00"))).toEqual({ closeAt: mskMoment("2026-10-08", "12:00"), deliveryDate: "2026-10-09" });
    expect(resolveSlot(tomorrow, null, at("14:00"))).toEqual({ closeAt: mskMoment("2026-10-09", "12:00"), deliveryDate: "2026-10-10" });
    expect(resolveSlot(afterTomorrow, null, at("11:00"))?.deliveryDate).toBe("2026-10-10");
    expect(resolveSlot(afterTomorrow, null, at("14:00"))?.deliveryDate).toBe("2026-10-11");
    expect(resolveSlot(inThreeDays, null, at("14:00"))).toEqual({ closeAt: mskMoment("2026-10-08", "17:00"), deliveryDate: "2026-10-11" });
  });

  it("еженедельный: следующая неделя, день недели задаёт торговая точка", () => {
    expect(resolveSlot(weekly, 2, at("14:00"))).toEqual({ closeAt: mskMoment("2026-10-12", "00:00"), deliveryDate: "2026-10-14" });
    // у ТТ без своего дня — день якоря, понедельник
    expect(resolveSlot(weekly, null, at("14:00"))?.deliveryDate).toBe("2026-10-12");
    expect(resolveSlot(weekly, 6, at("23:59", "2026-10-11"))?.deliveryDate).toBe("2026-10-18");
    expect(resolveSlot(weekly, 6, at("00:00", "2026-10-12"))?.deliveryDate).toBe("2026-10-25");
  });

  it("ежемесячный: неделя следующего месяца, в которой есть 22-е число", () => {
    expect(resolveSlot(monthly, 2, at("14:00"))).toEqual({ closeAt: mskMoment("2026-11-01", "00:00"), deliveryDate: "2026-11-18" });
    // февраль 2027: 22-е — понедельник, неделя 22–28
    expect(resolveSlot(monthly, 3, at("10:00", "2027-01-15"))?.deliveryDate).toBe("2027-02-25");
  });

  it("ценники: последний день следующего месяца", () => {
    expect(resolveSlot(prices, null, at("14:00"))?.deliveryDate).toBe("2026-11-30");
    expect(resolveSlot(prices, null, at("10:00", "2026-12-31"))?.deliveryDate).toBe("2027-01-31");
  });

  it("правило старого портала выражается теми же полями", () => {
    // в понедельник до 12:00 заказ ещё успевает на воскресенье этой недели
    const legacy = type("0 12 * * 1", "0 0 * * 7", 0);
    expect(resolveSlot(legacy, null, at("10:00", "2026-10-12"))?.deliveryDate).toBe("2026-10-18");
    expect(resolveSlot(legacy, null, at("13:00", "2026-10-12"))?.deliveryDate).toBe("2026-10-25");
  });

  it("с ошибкой в расписании доставку не обещает", () => {
    expect(resolveSlot(type("нет", "0 0 * * *", 1), null, at("14:00"))).toBeNull();
  });

  it("определяет, превращается ли сдвиг в день недели", () => {
    expect(anchorWeekday(weekly)).toBe(1);
    expect(anchorWeekday(monthly)).toBe(1);
    expect(anchorWeekday(type("0 0 * * *", "0 0 * * 0", 0))).toBe(7);
    expect(anchorWeekday(tomorrow)).toBeNull();
    expect(anchorWeekday(prices)).toBeNull();
  });
});

describe("статус и действия", () => {
  it("заказ открыт до закрытия приёма, затем в работе, после даты доставки — доставлен", () => {
    const target = order();
    expect(getOrderStatus(target, at("14:00"))).toBe("open");
    expect(getOrderStatus(target, at("12:00", "2026-10-09"))).toBe("locked");
    expect(getOrderStatus(target, at("09:00", "2026-10-10"))).toBe("locked");
    expect(getOrderStatus(target, at("09:00", "2026-10-11"))).toBe("done");
    expect(getOrderStatus(order({ cancelledAt: "2026-10-08T07:00:00Z" }), at("14:00"))).toBe("cancelled");
  });

  it("менять можно только открытый заказ, отменять заказ в работе — только администратор", () => {
    const target = order();
    expect(canEditOrder(target, at("14:00"), user)).toBe(true);
    expect(canCancelOrder(target, at("14:00"), user)).toBe(true);
    const locked = at("13:00", "2026-10-09");
    expect(canEditOrder(target, locked, admin)).toBe(false);
    expect(canCancelOrder(target, locked, user)).toBe(false);
    expect(canCancelOrder(target, locked, admin)).toBe(true);
    expect(canCancelOrder(target, at("09:00", "2026-10-11"), admin)).toBe(false);
  });

  it("без роли раздела ничего менять нельзя", () => {
    expect(getPermissions([])).toEqual({ canEdit: false, canManageLocked: false, canConfigure: false });
    expect(canEditOrder(order(), at("14:00"), getPermissions([]))).toBe(false);
  });
});

describe("количество", () => {
  it("шагает кратностью и держится в границах", () => {
    const bounds = quantityBounds({ step: 12, maxQuantity: null });
    expect(bounds).toEqual({ min: 12, max: 1200, step: 12 });
    expect(normalizeQuantity(12 + bounds.step, bounds)).toBe(24);
    expect(normalizeQuantity(13, bounds)).toBe(12);
    expect(normalizeQuantity(19, bounds)).toBe(24);
    expect(normalizeQuantity(99999, bounds)).toBe(1200);
    expect(normalizeQuantity(12 - bounds.step, bounds)).toBe(0);
    expect(normalizeQuantity(Number.NaN, bounds)).toBe(0);
  });

  it("свой максимум позиции важнее общего лимита", () => {
    expect(quantityBounds({ step: 1, maxQuantity: 5 })).toEqual({ min: 1, max: 5, step: 1 });
    expect(quantityBounds({ step: 1, maxQuantity: 1 })).toEqual({ min: 1, max: 1, step: 1 });
    expect(normalizeQuantity(30, quantityBounds({ step: 12.5, maxQuantity: null }))).toBe(25);
  });

  it("сумма считается только по позициям с ценой", () => {
    expect(orderTotals([line({ quantity: 24, price: 10 }), line({ productId: 2, quantity: 3, price: null })])).toEqual({ positions: 2, sum: 240, unpriced: 1 });
    expect(orderTotals([line({ price: null })]).sum).toBeNull();
  });
});
