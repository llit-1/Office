// Упрощённая копия OrderController в памяти: тесты раздела «Заказы» ходят в неё вместо сервера.
// Формат ответов — как у настоящего API (camelCase, даты — московское время без смещения).
import { ApiError } from "../../Services/api";

const MSK_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** Момент времени → серверная дата «2026-10-08T12:00:00». */
export const toServer = (moment: number) => new Date(moment + MSK_OFFSET_MS).toISOString().slice(0, 19);
/** Серверная дата → момент времени. */
export const fromServer = (value: string) => Date.parse(`${value.slice(0, 19)}+03:00`);

export interface FakeItem {
  id: number;
  rkcode: number | null;
  name: string;
  step: number;
  groupId: number;
  ruleId: number;
  avaliableForNative: number;
  avaliableForFranchise: number;
  actual: number;
}

export interface FakeOrder {
  id: number;
  ruleId: number;
  locationGuid: string;
  creationDateTime: string;
  officeUserId: number;
  userName: string;
  lines: { id: number; quantity: number }[];
}

interface FakeRule {
  id: number;
  name: string;
  /** Час закрытия приёма; у еженедельного — понедельник, 00:00. */
  hour: number;
  weekly: boolean;
  /** Через сколько дней после закрытия доставка. */
  shipmentDays: number;
}

export const STORE_A = "11111111-1111-1111-1111-111111111111";
export const STORE_B = "22222222-2222-2222-2222-222222222222";
export const STORE_C = "33333333-3333-3333-3333-333333333333";
export const DAILY = 1;
export const WEEKLY = 4;

export interface FakeCall {
  method: "GET" | "POST" | "PUT";
  url: string;
  params?: Record<string, unknown>;
  body?: unknown;
}

export function createFakeServer(now: () => number) {
  const rules: FakeRule[] = [
    { id: DAILY, name: "Регулярный (Завтра)", hour: 12, weekly: false, shipmentDays: 1 },
    { id: WEEKLY, name: "Еженедельный", hour: 0, weekly: true, shipmentDays: 2 },
  ];
  let locations = [
    { guid: STORE_A, name: "Парашютная 63" },
    { guid: STORE_B, name: "Невский 87" },
    { guid: STORE_C, name: "Тореза 9" },
  ];
  const groups = [{ id: 1, name: "Заморозка" }, { id: 2, name: "Напитки" }, { id: 3, name: "Упаковка" }];
  const items: FakeItem[] = [
    { id: 1, rkcode: 100, name: "Багет зерновой", step: 6, groupId: 1, ruleId: DAILY, avaliableForNative: 1, avaliableForFranchise: 1, actual: 1 },
    { id: 2, rkcode: 101, name: "Булочка заварная", step: 12, groupId: 1, ruleId: DAILY, avaliableForNative: 1, avaliableForFranchise: 1, actual: 1 },
    { id: 3, rkcode: 102, name: "Круассан", step: 1, groupId: 1, ruleId: DAILY, avaliableForNative: 1, avaliableForFranchise: 0, actual: 0 },
    { id: 4, rkcode: 200, name: "Морс клюквенный", step: 10, groupId: 2, ruleId: DAILY, avaliableForNative: 1, avaliableForFranchise: 1, actual: 1 },
    { id: 5, rkcode: 300, name: "Коробка для торта", step: 50, groupId: 3, ruleId: WEEKLY, avaliableForNative: 1, avaliableForFranchise: 1, actual: 1 },
  ];
  const orders: FakeOrder[] = [];
  const calls: FakeCall[] = [];
  let nextOrderId = 500;
  let nextItemId = 50;
  const currentUser = { id: 5, name: "Тест Тестов" };

  /** Срабатывания расписания правила: count штук начиная с момента from включительно. */
  function occurrences(rule: FakeRule, from: number, count: number) {
    const result: number[] = [];
    const startDay = Math.floor((from + MSK_OFFSET_MS) / DAY_MS);
    for (let day = startDay; result.length < count; day += 1) {
      const moment = day * DAY_MS + rule.hour * 3_600_000 - MSK_OFFSET_MS;
      // 1 января 1970 — четверг: понедельник — когда (день + 3) кратно семи
      if (rule.weekly && (day + 3) % 7 !== 0) continue;
      if (moment >= from) result.push(moment);
    }
    return result;
  }

  function previous(rule: FakeRule, before: number) {
    const all = occurrences(rule, before - 8 * DAY_MS, 12).filter((moment) => moment < before);
    return all[all.length - 1];
  }

  const shipmentOf = (rule: FakeRule, creation: number) => {
    const day = Math.floor((creation + MSK_OFFSET_MS) / DAY_MS) + rule.shipmentDays;
    return toServer(day * DAY_MS - MSK_OFFSET_MS);
  };

  const itemDto = (item: FakeItem, quantity?: number) => (quantity === undefined ? { ...item } : { ...item, quantity });
  const orderItems = (order: FakeOrder) => order.lines.map((line) => itemDto(items.find((item) => item.id === line.id)!, line.quantity));
  const groupsOf = (list: FakeItem[]) => groups
    .map((group) => ({ id: group.id, name: group.name, items: list.filter((item) => item.groupId === group.id).map((item) => itemDto(item)) }))
    .filter((group) => group.items.length > 0);

  const fail = (status: number, message: string): never => { throw new ApiError(message, status, { message }); };
  const ruleOf = (id: number) => rules.find((rule) => rule.id === id) ?? fail(404, "Правило заказа не найдено.");
  const requireLocation = (guid: string) => { if (!locations.some((location) => location.guid === guid)) fail(403, "Forbidden"); };

  function handle(call: FakeCall): unknown {
    calls.push(call);
    const { method, url, params, body } = call;
    let match: RegExpExecArray | null;

    if (method === "GET" && url === "/Order/rules") {
      return { locations: locations.map((location) => ({ ...location, actual: 1 })), rules: rules.map((rule) => ({ id: rule.id, name: rule.name, interval: "", shipmentInterval: "", items: [], locationRules: [] })) };
    }

    if (method === "GET" && (match = /^\/Order\/rules\/(\d+)\/orders$/.exec(url))) {
      const ruleId = Number(match[1]);
      const guid = params?.locationGuid as string | undefined;
      if (guid) requireLocation(guid);
      const rule = rules.find((candidate) => candidate.id === ruleId);
      return locations
        .filter((location) => !guid || location.guid === guid)
        .map((location) => ({
          location: location.name,
          locationGUID: location.guid,
          officeOrders: orders
            .filter((order) => order.ruleId === ruleId && order.locationGuid === location.guid)
            .sort((left, right) => fromServer(right.creationDateTime) - fromServer(left.creationDateTime))
            .map((order) => ({
              id: order.id,
              creationDateTime: order.creationDateTime,
              shipmentDateTime: rule ? shipmentOf(rule, fromServer(order.creationDateTime)) : null,
              locationGuid: order.locationGuid,
              ruleId: order.ruleId,
              officeUserId: order.officeUserId,
              userName: order.userName,
              items: orderItems(order),
            })),
        }))
        .filter((group) => group.officeOrders.length > 0);
    }

    if (method === "GET" && (match = /^\/Order\/orders\/(\d+)\/items$/.exec(url))) {
      const order = orders.find((candidate) => candidate.id === Number(match![1])) ?? fail(404, "Заказ не найден.");
      requireLocation(order.locationGuid);
      return orderItems(order);
    }

    if (method === "GET" && (match = /^\/Order\/rules\/(\d+)\/locations\/([0-9a-f-]+)\/contents$/.exec(url))) {
      const rule = ruleOf(Number(match[1]));
      const guid = match[2];
      requireLocation(guid);
      const upcoming = occurrences(rule, now(), 20);
      const requested = params?.creationDateTime as string | undefined;
      const creation = requested ? fromServer(requested) : upcoming[0];
      const order = orders.find((candidate) => candidate.ruleId === rule.id && candidate.locationGuid === guid && fromServer(candidate.creationDateTime) === creation);
      return {
        orderCreationDateTimes: [previous(rule, now()), ...upcoming].map(toServer),
        itemGroups: groupsOf(items.filter((item) => item.ruleId === rule.id && item.actual === 1)),
        orderCreationDateTime: toServer(creation),
        orderShipmentDateTime: shipmentOf(rule, creation),
        orderItems: order ? orderItems(order) : [],
      };
    }

    if (method === "POST" && url === "/Order/orders") {
      const draft = body as { creationDateTime: string; locationGuid: string; ruleId: number; items: { id: number; quantity: number }[] };
      requireLocation(draft.locationGuid);
      ruleOf(draft.ruleId);
      const creation = fromServer(draft.creationDateTime);
      if (creation < now()) fail(409, "Приём изменений по этому заказу уже закрыт.");
      let order = orders.find((candidate) => candidate.ruleId === draft.ruleId && candidate.locationGuid === draft.locationGuid && fromServer(candidate.creationDateTime) === creation);
      if (!order) {
        order = { id: nextOrderId++, ruleId: draft.ruleId, locationGuid: draft.locationGuid, creationDateTime: toServer(creation), officeUserId: currentUser.id, userName: currentUser.name, lines: [] };
        orders.push(order);
      }
      order.officeUserId = currentUser.id;
      order.userName = currentUser.name;
      order.lines = draft.items.map((line) => ({ id: line.id, quantity: line.quantity }));
      return { id: order.id, creationDateTime: order.creationDateTime, locationGuid: order.locationGuid, ruleId: order.ruleId, officeUserId: order.officeUserId, items: orderItems(order) };
    }

    if (method === "GET" && (match = /^\/Order\/rules\/(\d+)\/items$/.exec(url))) {
      return groupsOf(items.filter((item) => item.ruleId === Number(match![1])));
    }

    if (method === "POST" && url === "/Order/items") {
      const item = { ...(body as FakeItem), id: nextItemId++ };
      if (item.rkcode !== null && items.some((candidate) => candidate.rkcode === item.rkcode)) fail(409, `Позиция с кодом R-Keeper ${item.rkcode} уже есть.`);
      items.push(item);
      return item;
    }

    if (method === "PUT" && (match = /^\/Order\/items\/(\d+)$/.exec(url))) {
      const id = Number(match[1]);
      const index = items.findIndex((candidate) => candidate.id === id);
      if (index < 0) fail(404, "Позиция не найдена.");
      items[index] = { ...(body as FakeItem), id };
      return items[index];
    }

    return fail(404, `Нет такого запроса: ${method} ${url}`);
  }

  const respond = (call: FakeCall) => new Promise((resolve, reject) => {
    try {
      resolve(structuredClone(handle(call)));
    } catch (error) {
      reject(error);
    }
  });

  return {
    rules,
    items,
    orders,
    calls,
    occurrences: (ruleId: number, count: number) => occurrences(ruleOf(ruleId), now(), count).map(toServer),
    previous: (ruleId: number) => toServer(previous(ruleOf(ruleId), now())),
    shipment: (ruleId: number, creationDateTime: string) => shipmentOf(ruleOf(ruleId), fromServer(creationDateTime)),
    setLocations(guids: string[]) { locations = locations.filter((location) => guids.includes(location.guid)); },
    addOrder(order: Omit<FakeOrder, "id" | "officeUserId" | "userName"> & { userName?: string }) {
      const saved: FakeOrder = { officeUserId: 7, userName: "Анна Морозова", ...order, id: nextOrderId++ };
      orders.push(saved);
      return saved;
    },
    get: (url: string, config?: { params?: Record<string, unknown> }) => respond({ method: "GET", url, params: config?.params }),
    post: (url: string, body?: unknown) => respond({ method: "POST", url, body }),
    put: (url: string, body?: unknown) => respond({ method: "PUT", url, body }),
  };
}

export type FakeServer = ReturnType<typeof createFakeServer>;
