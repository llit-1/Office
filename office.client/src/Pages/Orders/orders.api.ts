// Точка обмена данными раздела «Заказы». Сейчас за ней демо-хранилище (orders.mock.ts);
// при появлении API тела функций заменяются HTTP-вызовами, сигнатуры остаются.
// Проверки в saveOrder / cancelOrder — то, что должен гарантировать сервер:
// интерфейс лишь подсказывает заранее, источник истины — бэкенд.
import { getDb, persistDb, resetDb } from "./orders.mock";
import { canCancelOrder, canEditOrder, cronError, findStoreOffset, resolveSlot } from "./orders.rules";
import type {
  Catalog,
  CatalogGroup,
  CatalogItem,
  Order,
  OrderDraft,
  OrdersBootstrap,
  OrdersPermissions,
  OrderTypeConfig,
  SaveOrderResult,
  UserRef,
} from "./orders.types";

export interface Actor {
  user: UserRef;
  permissions: OrdersPermissions;
}

export class OrdersApiError extends Error {}

const latency = import.meta.env.MODE === "test" ? 0 : 160;
const respond = <T,>(value: T): Promise<T> =>
  new Promise((resolve) => { window.setTimeout(() => resolve(structuredClone(value)), latency); });
const fail = (message: string): never => { throw new OrdersApiError(message); };

export const getOrdersErrorMessage = (error: unknown, fallback: string) =>
  error instanceof OrdersApiError ? error.message : fallback;

/* ===== Чтение ===== */

export function getOrdersBootstrap(): Promise<OrdersBootstrap> {
  const db = getDb();
  return respond({
    types: [...db.types].sort((left, right) => left.id - right.id),
    stores: [...db.stores].sort((left, right) => left.name.localeCompare(right.name, "ru")),
    deliveryDays: db.deliveryDays,
  });
}

export function getCatalog(typeId: number): Promise<Catalog> {
  const db = getDb();
  const groups = db.groups.filter((group) => group.typeId === typeId).sort((left, right) => left.name.localeCompare(right.name, "ru"));
  const ids = new Set(groups.map((group) => group.id));
  return respond({
    groups,
    items: db.items.filter((item) => ids.has(item.groupId)).sort((left, right) => left.name.localeCompare(right.name, "ru")),
  });
}

export function getOrders(): Promise<Order[]> {
  return respond(getDb().orders);
}

export function getOrder(id: number): Promise<Order | null> {
  return respond(getDb().orders.find((order) => order.id === id) ?? null);
}

/* ===== Заказы ===== */

export async function saveOrder(draft: OrderDraft, actor: Actor): Promise<SaveOrderResult> {
  const db = getDb();
  const now = new Date();
  const reject = (message: string) => respond<SaveOrderResult>({ ok: false, message });

  if (!actor.permissions.canEdit) return reject("Недостаточно прав для оформления заказа.");
  const lines = draft.lines.filter((line) => line.quantity > 0);
  if (lines.length === 0) return reject("Добавьте в заказ хотя бы одну позицию.");

  if (draft.id !== null) {
    const existing = db.orders.find((order) => order.id === draft.id);
    if (!existing) return reject("Заказ не найден — возможно, его уже отменили.");
    if (!canEditOrder(existing, now, actor.permissions)) return reject("Приём изменений по этому заказу уже закрыт.");
    existing.lines = lines;
    persistDb();
    return respond<SaveOrderResult>({ ok: true, order: existing });
  }

  const type = db.types.find((candidate) => candidate.id === draft.typeId);
  if (!type || !type.isActive) return reject("Эта вкладка заказов сейчас отключена.");
  const store = db.stores.find((candidate) => candidate.id === draft.storeId);
  if (!store) return reject("Выберите торговую точку, на которую оформляется заказ.");
  if (store.closed) return reject("Торговая точка закрыта — заказ на неё оформить нельзя.");

  // дату доставки и срок правок считает сервер — клиент их не присылает
  const slot = resolveSlot(type, findStoreOffset(db.deliveryDays, type.id, store.id), now);
  if (!slot) return reject("Для этой вкладки не настроено расписание приёма.");
  const duplicate = db.orders.find((order) =>
    order.typeId === type.id && order.storeId === store.id && order.deliveryDate === slot.deliveryDate && !order.cancelledAt);
  if (duplicate) return reject(`На эту доставку у торговой точки уже есть заказ № ${duplicate.id}. Измените его.`);

  db.seq.order += 1;
  const order: Order = {
    id: db.seq.order, typeId: type.id, storeId: store.id, storeName: store.name, deliveryDate: slot.deliveryDate,
    closeAt: new Date(slot.closeAt).toISOString(), lines, createdAt: now.toISOString(), createdBy: actor.user,
    cancelledAt: null, cancelledBy: null,
  };
  db.orders.unshift(order);
  persistDb();
  return respond<SaveOrderResult>({ ok: true, order });
}

export async function cancelOrder(id: number, actor: Actor): Promise<Order> {
  const order = getDb().orders.find((candidate) => candidate.id === id) ?? fail("Заказ не найден.");
  if (!canCancelOrder(order, new Date(), actor.permissions)) fail("Этот заказ уже нельзя отменить.");
  order.cancelledAt = new Date().toISOString();
  order.cancelledBy = actor.user;
  persistDb();
  return respond(order);
}

/* ===== Настройки ===== */

const requireAdmin = (actor: Actor) => { if (!actor.permissions.canConfigure) fail("Недостаточно прав для изменения настроек."); };

export async function saveOrderType(input: OrderTypeConfig, actor: Actor): Promise<OrderTypeConfig> {
  requireAdmin(actor);
  const db = getDb();
  const type: OrderTypeConfig = { ...input, name: input.name.trim(), closeCron: input.closeCron.trim(), deliveryCron: input.deliveryCron.trim() };
  if (!type.name) fail("Укажите название вкладки.");
  if (db.types.some((candidate) => candidate.id !== type.id && candidate.name.toLowerCase() === type.name.toLowerCase())) {
    fail("Вкладка с таким названием уже есть.");
  }
  const invalid = cronError(type.closeCron) ?? cronError(type.deliveryCron);
  if (invalid) fail(invalid);
  if (!Number.isInteger(type.offsetDays) || type.offsetDays < 0) fail("Сдвиг — целое число дней, не меньше нуля.");

  const index = db.types.findIndex((candidate) => candidate.id === type.id);
  if (index >= 0) db.types[index] = type;
  else {
    db.seq.type += 1;
    type.id = db.seq.type;
    db.types.push(type);
  }
  persistDb();
  return respond(type);
}

/** Свой сдвиг дня доставки у ТТ; null — как у вкладки. */
export async function setDeliveryDay(typeId: number, storeId: number, offsetDays: number | null, actor: Actor): Promise<void> {
  requireAdmin(actor);
  const db = getDb();
  db.deliveryDays = db.deliveryDays.filter((item) => !(item.typeId === typeId && item.storeId === storeId));
  if (offsetDays !== null) db.deliveryDays.push({ typeId, storeId, offsetDays });
  persistDb();
  return respond(undefined);
}

export async function saveGroup(input: CatalogGroup, actor: Actor): Promise<CatalogGroup> {
  requireAdmin(actor);
  const db = getDb();
  const group: CatalogGroup = { ...input, name: input.name.trim() };
  if (!group.name) fail("Укажите название группы.");
  if (db.groups.some((candidate) => candidate.id !== group.id && candidate.typeId === group.typeId && candidate.name.toLowerCase() === group.name.toLowerCase())) {
    fail("Группа с таким названием уже есть на этой вкладке.");
  }
  const index = db.groups.findIndex((candidate) => candidate.id === group.id);
  if (index >= 0) db.groups[index] = group;
  else {
    db.seq.group += 1;
    group.id = db.seq.group;
    db.groups.push(group);
  }
  persistDb();
  return respond(group);
}

export async function deleteGroup(id: number, actor: Actor): Promise<void> {
  requireAdmin(actor);
  const db = getDb();
  if (db.items.some((item) => item.groupId === id)) fail("В группе есть позиции. Перенесите или удалите их, затем удалите группу.");
  db.groups = db.groups.filter((group) => group.id !== id);
  persistDb();
  return respond(undefined);
}

export async function saveItem(input: CatalogItem, actor: Actor): Promise<CatalogItem> {
  requireAdmin(actor);
  const db = getDb();
  const item: CatalogItem = { ...input, article: input.article.trim(), name: input.name.trim() };
  if (!item.article) fail("Укажите артикул.");
  if (!item.name) fail("Укажите наименование.");
  if (!(item.step > 0)) fail("Кратность должна быть больше нуля.");
  if (item.maxQuantity !== null && item.maxQuantity < item.step) fail("Максимум не может быть меньше кратности.");
  if (!db.groups.some((group) => group.id === item.groupId)) fail("Выберите группу.");
  if (db.items.some((candidate) => candidate.id !== item.id && candidate.groupId === item.groupId && candidate.article === item.article)) {
    fail(`Позиция с артикулом ${item.article} уже есть в этой группе.`);
  }
  const index = db.items.findIndex((candidate) => candidate.id === item.id);
  if (index >= 0) db.items[index] = item;
  else {
    db.seq.item += 1;
    item.id = db.seq.item;
    db.items.push(item);
  }
  persistDb();
  return respond(item);
}

export async function patchItems(ids: number[], patch: Partial<Pick<CatalogItem, "isActive" | "forOwn" | "forPartner" | "groupId">>, actor: Actor): Promise<void> {
  requireAdmin(actor);
  const selected = new Set(ids);
  getDb().items.forEach((item) => { if (selected.has(item.id)) Object.assign(item, patch); });
  persistDb();
  return respond(undefined);
}

export async function deleteItems(ids: number[], actor: Actor): Promise<void> {
  requireAdmin(actor);
  const db = getDb();
  const selected = new Set(ids);
  db.items = db.items.filter((item) => !selected.has(item.id));
  persistDb();
  return respond(undefined);
}

/** Возвращает демо-данные к исходному состоянию. Исчезнет вместе с демо-хранилищем. */
export async function resetDemoData(actor: Actor): Promise<void> {
  requireAdmin(actor);
  resetDb();
  return respond(undefined);
}
