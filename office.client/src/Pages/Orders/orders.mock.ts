// Демо-хранилище раздела «Заказы»: заменяет сервер, пока нет API.
// Структура повторяет согласованную схему БД (OfficeOrderTypes, OfficeOrderDeliveryDays,
// OfficeOrderGroups, OfficeOrderProducts, OfficeOrders, OfficeOrderLines).
// Данные генерируются относительно текущей даты и живут в localStorage браузера.
// Вся работа со страниц идёт через orders.api.ts — после подключения бэкенда
// этот файл и orders.catalog.mock.ts удаляются без правок интерфейса.
import { seedCatalog } from "./orders.catalog.mock";
import { findStoreOffset, isItemAvailable, normalizeQuantity, quantityBounds, resolveSlot, toOrderLine } from "./orders.rules";
import type { CatalogGroup, CatalogItem, DeliveryDay, Order, OrderLine, OrderTypeConfig, Store, UserRef } from "./orders.types";

export interface OrdersDb {
  version: number;
  types: OrderTypeConfig[];
  deliveryDays: DeliveryDay[];
  groups: CatalogGroup[];
  items: CatalogItem[];
  stores: Store[];
  orders: Order[];
  seq: { type: number; group: number; item: number; order: number };
}

const STORAGE_KEY = "office.orders.demo.v1";
const DB_VERSION = 3;
const isTest = import.meta.env.MODE === "test";

const WEEKLY = 4;
const MONTHLY = 5;
const PRICES = 6;

/** Шесть вкладок: приём закрывается по первому крону, якорь доставки — по второму, дальше сдвиг в днях. */
const seedTypes: OrderTypeConfig[] = [
  { id: 1, name: "Регулярный (Завтра)", isActive: true, closeCron: "0 12 * * *", deliveryCron: "0 0 * * *", offsetDays: 1 },
  { id: 2, name: "Регулярный (Послезавтра)", isActive: true, closeCron: "0 12 * * *", deliveryCron: "0 0 * * *", offsetDays: 2 },
  { id: 3, name: "Регулярный (Через 3 дня)", isActive: true, closeCron: "0 17 * * *", deliveryCron: "0 0 * * *", offsetDays: 3 },
  // приём до конца недели, якорь — понедельник следующей; день внутри недели задаёт ТТ
  { id: WEEKLY, name: "Еженедельный", isActive: true, closeCron: "0 0 * * 1", deliveryCron: "0 0 * * 1", offsetDays: 0 },
  // приём до конца месяца, якорь — понедельник недели, в которой есть 22-е число
  { id: MONTHLY, name: "Ежемесячный", isActive: true, closeCron: "0 0 1 * *", deliveryCron: "0 0 16-22 * 1", offsetDays: 0 },
  // приём до конца месяца, доставка в последний день следующего
  { id: PRICES, name: "Ценники", isActive: true, closeCron: "0 0 1 * *", deliveryCron: "0 0 L * *", offsetDays: 0 },
];

const seedStores: Store[] = [
  ["Парашютная 63", 45, "own"], ["Комендантский 66", 111, "own"], ["Невский 87", 78, "own"],
  ["Б. Московская 1-3", 55, "own"], ["Энгельса 111", 115, "own"], ["Ветеранов 169 к4", 26, "own"],
  ["Тореза 9", 98, "own"], ["Новаторов 8", 59, "own"], ["Столичная 1", 19, "own"],
  ["Некрасова 1", 49, "partner"], ["Сикейроса 11", 23, "partner"], ["Богатырский 54", 12, "partner"],
  ["Юнтоловский 47", 15, "partner"], ["Лермонтовский 8", 83, "own"],
].map(([name, code, management], index) => ({
  id: index + 1,
  code: code as number,
  name: name as string,
  management: management as Store["management"],
  closed: name === "Лермонтовский 8",
}));

const people = [
  "Анна Морозова", "Ольга Седова", "Марина Лебедева", "Светлана Котова", "Елена Жукова", "Наталья Белова", "Ирина Громова",
  "Дарья Соловьёва", "Юлия Крылова", "Татьяна Орлова", "Виктория Зайцева", "Ксения Фролова", "Алина Тихонова", "Полина Юдина",
];

/** Детерминированный генератор: демо-данные одинаковы от запуска к запуску. */
function mulberry32(seed: number) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) value = Math.imul(value ^ text.charCodeAt(index), 16777619);
  return (value >>> 0) / 4294967296;
}

/** Правдоподобная «последняя цена отгрузки». У части позиций отгрузок не было, у ценников цен нет вовсе. */
function seedPrice(typeId: number, article: string, step: number): number | null {
  if (typeId === PRICES || hash(`${typeId}:${article}`) < 0.14) return null;
  const spread = hash(`price:${article}`);
  if (typeId === WEEKLY) return Math.round(((60 + spread * 1500) / Math.max(1, step)) * 100) / 100;
  if (typeId === MONTHLY) return Math.round((35 + spread * 820) * 100) / 100;
  return Math.round((28 + spread * 260) * 100) / 100;
}

function seedCatalogData() {
  const groups: CatalogGroup[] = [];
  const items: CatalogItem[] = [];
  for (const seed of seedCatalog) {
    // регулярный ассортимент расходится по трём вкладкам по сроку доставки группы
    const typeId = seed.type === "regular" ? seed.leadDays ?? 1 : seed.type === "weekly" ? WEEKLY : seed.type === "monthly" ? MONTHLY : PRICES;
    const group: CatalogGroup = { id: groups.length + 1, typeId, name: seed.name };
    groups.push(group);
    for (const [article, name, step, max, flags] of seed.items) {
      items.push({
        id: items.length + 1,
        groupId: group.id,
        article,
        name,
        step,
        maxQuantity: seed.maxSteps === 1 ? step : max > 0 ? max : null,
        isActive: (flags & 1) !== 0,
        forOwn: (flags & 2) !== 0,
        forPartner: (flags & 4) !== 0,
        price: seedPrice(typeId, article, step),
      });
    }
  }
  return { groups, items };
}

function seedOrders(db: OrdersDb, now: Date) {
  const rand = mulberry32(20261008);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)];
  const between = (min: number, max: number) => min + rand() * (max - min);
  const nowMs = now.getTime();
  const HOUR = 3_600_000;
  const openStores = db.stores.filter((store) => !store.closed);
  const users = new Map<number, UserRef[]>(openStores.map((store, index) => [store.id, [
    { id: 100 + index, name: people[index % people.length] },
    { id: 200 + index, name: `Розница ${store.name}` },
  ]]));
  const groupById = new Map(db.groups.map((group) => [group.id, group]));
  const taken = new Set<string>();

  const pickLines = (typeId: number, store: Store, count: number): OrderLine[] => db.items
    .filter((item) => groupById.get(item.groupId)?.typeId === typeId && isItemAvailable(item, store))
    .map((item) => ({ item, order: rand() }))
    .sort((left, right) => left.order - right.order)
    .slice(0, count)
    .map(({ item }) => toOrderLine(item, groupById.get(item.groupId), normalizeQuantity(item.step * pick([1, 1, 1, 2, 2, 3]), quantityBounds(item))))
    .sort((left, right) => left.name.localeCompare(right.name, "ru"));

  // вероятность оформить заказ в отдельно взятый день и размер заказа — по вкладкам
  const profile: Record<number, { chance: number; lines: [number, number] }> = {
    1: { chance: 0.45, lines: [3, 10] }, 2: { chance: 0.4, lines: [3, 10] }, 3: { chance: 0.35, lines: [3, 8] },
    [WEEKLY]: { chance: 0.16, lines: [8, 20] }, [MONTHLY]: { chance: 0.035, lines: [4, 11] }, [PRICES]: { chance: 0.02, lines: [6, 16] },
  };

  for (const type of db.types) {
    const { chance, lines: lineRange } = profile[type.id] ?? { chance: 0.1, lines: [3, 8] };
    const regular = type.id <= 3;
    openStores.forEach((store, storeIndex) => {
      // регулярными заказами пользуется меньшая часть точек — как и в реальных данных
      if (regular && storeIndex >= 6) return;
      const offset = findStoreOffset(db.deliveryDays, type.id, store.id);
      for (let back = 75; back >= 0; back -= 1) {
        if (rand() > (regular && storeIndex === 0 ? 0.8 : chance)) continue;
        const createdAt = nowMs - back * 24 * HOUR - between(0.2, 9) * HOUR;
        const slot = resolveSlot(type, offset, new Date(createdAt));
        const key = `${type.id}|${store.id}|${slot?.deliveryDate}`;
        // на одну доставку у ТТ один заказ
        if (!slot || taken.has(key)) continue;
        const lines = pickLines(type.id, store, Math.round(between(...lineRange)));
        if (lines.length === 0) continue;
        taken.add(key);
        const author = pick(users.get(store.id)!);
        const order: Order = {
          id: 0, typeId: type.id, storeId: store.id, storeName: store.name, deliveryDate: slot.deliveryDate,
          closeAt: new Date(slot.closeAt).toISOString(), lines, createdAt: new Date(createdAt).toISOString(), createdBy: author,
          cancelledAt: null, cancelledBy: null,
        };
        const cancelAt = Math.min(createdAt + between(0.3, 3) * HOUR, Math.min(slot.closeAt, nowMs) - 30_000);
        if (rand() < 0.04 && cancelAt > createdAt) {
          order.cancelledAt = new Date(cancelAt).toISOString();
          order.cancelledBy = author;
        }
        db.orders.push(order);
      }
    });
  }

  db.orders.sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  db.orders.forEach((order, index) => { order.id = 20001 + index; });
  db.seq.order = 20000 + db.orders.length;
  db.orders.reverse();
}

export function createSeedDb(now = new Date()): OrdersDb {
  const { groups, items } = seedCatalogData();
  const stores = seedStores.map((store) => ({ ...store }));
  const openStores = stores.filter((store) => !store.closed);
  const db: OrdersDb = {
    version: DB_VERSION,
    types: seedTypes.map((type) => ({ ...type })),
    // недельным и месячным заказам каждая ТТ получает свой будний день
    deliveryDays: openStores.flatMap((store, index) => [
      { typeId: WEEKLY, storeId: store.id, offsetDays: index % 5 },
      { typeId: MONTHLY, storeId: store.id, offsetDays: (index + 2) % 5 },
    ]),
    groups,
    items,
    stores,
    orders: [],
    seq: { type: seedTypes.length, group: groups.length, item: items.length, order: 20000 },
  };
  seedOrders(db, now);
  return db;
}

let cache: OrdersDb | null = null;

export function getDb(): OrdersDb {
  if (cache) return cache;
  if (!isTest) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as OrdersDb) : null;
      if (parsed?.version === DB_VERSION) {
        cache = parsed;
        return cache;
      }
    } catch {
      // повреждённое хранилище — начинаем с чистых демо-данных
    }
  }
  cache = createSeedDb();
  persistDb();
  return cache;
}

export function persistDb() {
  if (isTest || !cache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // переполнено или недоступно — данные остаются в памяти до перезагрузки
  }
}

export function resetDb(now = new Date()) {
  cache = createSeedDb(now);
  persistDb();
  return cache;
}
