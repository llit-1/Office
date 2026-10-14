import { describe, expect, it } from "vitest";
import { formatDelivery, formatMoment } from "../../Pages/Orders/orders.format";
import {
  canEditOrder,
  editorPath,
  getPermissions,
  isOrderOpen,
  mskToday,
  normalizeQuantity,
  quantityBounds,
  serverMoment,
} from "../../Pages/Orders/orders.rules";

// четверг, 8 октября 2026, по Москве
const at = (time: string, day = "2026-10-08") => new Date(`${day}T${time}:00+03:00`);
const user = getPermissions(["Order_man"]);
const ownOnly = getPermissions(["Order_woman"]);
const admin = getPermissions(["OrdersTTAdmin"]);

const order = { creationDateTime: "2026-10-09T12:00:00" };

describe("серверное время", () => {
  it("дата без смещения — московское время, в каком бы поясе ни был браузер", () => {
    expect(serverMoment("2026-10-09T12:00:00")).toBe(Date.parse("2026-10-09T09:00:00Z"));
    // если сервер когда-нибудь пришлёт смещение, оно уважается
    expect(serverMoment("2026-10-09T12:00:00Z")).toBe(Date.parse("2026-10-09T12:00:00Z"));
    expect(serverMoment("2026-10-09T12:00:00+05:00")).toBe(Date.parse("2026-10-09T07:00:00Z"));
    // 23:30 по Гринвичу — уже следующий день по Москве
    expect(mskToday(new Date("2026-10-08T23:30:00Z"))).toBe("2026-10-09");
  });

  it("показывает дату формирования и день доставки", () => {
    expect(formatMoment("2026-10-09T12:00:00")).toBe("пт, 9 окт 12:00");
    expect(formatDelivery("2026-10-09T00:00:00", at("14:00"))).toEqual({ date: "пт, 09.10", relative: "завтра" });
    expect(formatDelivery("2026-10-20T00:00:00", at("14:00"))).toEqual({ date: "вт, 20.10", relative: "" });
  });
});

describe("доступные действия", () => {
  it("заказ открыт до даты формирования", () => {
    expect(isOrderOpen(order, at("11:59", "2026-10-09"))).toBe(true);
    expect(isOrderOpen(order, at("12:00", "2026-10-09"))).toBe(false);
  });

  it("после даты формирования заказ меняет только администратор", () => {
    expect(canEditOrder(order, at("14:00"), user)).toBe(true);
    expect(canEditOrder(order, at("14:00"), ownOnly)).toBe(true);
    expect(canEditOrder(order, at("13:00", "2026-10-09"), user)).toBe(false);
    expect(canEditOrder(order, at("13:00", "2026-10-09"), ownOnly)).toBe(false);
    expect(canEditOrder(order, at("13:00", "2026-10-09"), admin)).toBe(true);
  });

  it("три роли раздела: настройки и правка после формирования — только у администратора", () => {
    expect(admin).toEqual({ canEdit: true, canEditClosed: true, canConfigure: true });
    expect(user).toEqual({ canEdit: true, canEditClosed: false, canConfigure: false });
    expect(ownOnly).toEqual({ canEdit: true, canEditClosed: false, canConfigure: false });
    // старой роли больше нет
    expect(getPermissions(["OrdersTT"]).canEdit).toBe(false);
  });

  it("без роли раздела ничего менять нельзя", () => {
    expect(getPermissions([])).toEqual({ canEdit: false, canEditClosed: false, canConfigure: false });
    expect(canEditOrder(order, at("14:00"), getPermissions([]))).toBe(false);
  });
});

describe("количество", () => {
  it("кратно шагу позиции; наименьшее количество — сам шаг", () => {
    expect(quantityBounds({ step: 12 })).toEqual({ min: 12, max: 1200, step: 12 });
    expect(quantityBounds({ step: 1 })).toEqual({ min: 1, max: 100, step: 1 });
    // шаг не задан
    expect(quantityBounds({ step: 0 })).toEqual({ min: 1, max: 100, step: 1 });
  });

  it("ручной ввод приводится к допустимому", () => {
    const bounds = quantityBounds({ step: 12 });
    expect(normalizeQuantity(30, bounds)).toBe(36);
    expect(normalizeQuantity(13, bounds)).toBe(12);
    expect(normalizeQuantity(5, bounds)).toBe(12);
    expect(normalizeQuantity(99999, bounds)).toBe(1200);
    expect(normalizeQuantity(12 - bounds.step, bounds)).toBe(0);
    expect(normalizeQuantity(0, bounds)).toBe(0);
    expect(normalizeQuantity(Number.NaN, bounds)).toBe(0);
  });

  it("дробный шаг: кратные 12,5 и без погрешности чисел с плавающей точкой", () => {
    const gel = quantityBounds({ step: 12.5 });
    expect(gel).toEqual({ min: 12.5, max: 1250, step: 12.5 });
    expect(normalizeQuantity(30, gel)).toBe(25);
    expect(normalizeQuantity(40, gel)).toBe(37.5);
    expect(normalizeQuantity(37.5 + gel.step, gel)).toBe(50);
    const tenth = quantityBounds({ step: 0.1 });
    expect(normalizeQuantity(0.1 + 0.2, tenth)).toBe(0.3);
    expect(tenth.max).toBe(10);
  });
});

describe("адрес редактора", () => {
  it("тип — в пути, торговая точка и дата — в параметрах", () => {
    expect(editorPath(4)).toBe("/Orders/order/4");
    expect(editorPath(4, { store: null })).toBe("/Orders/order/4");
    expect(editorPath(1, { store: "abc", date: "2026-10-09T12:00:00" })).toBe("/Orders/order/1?store=abc&date=2026-10-09T12%3A00%3A00");
  });
});
