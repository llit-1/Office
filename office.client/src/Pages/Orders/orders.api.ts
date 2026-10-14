// Запросы раздела «Заказы» к OrderController. Здесь же — перевод ответов сервера в типы интерфейса.
// Кто пользователь и какие торговые точки ему доступны, сервер определяет по токену.
import { ApiError, get, getFriendlyErrorMessage, post, put } from "../../Services/api";
import type {
  CatalogGroup,
  CatalogItem,
  Order,
  OrderContents,
  OrderDraft,
  OrderLine,
  OrdersBootstrap,
  ServerDateTime,
  StoreOrders,
} from "./orders.types";

/* ===== Ответы сервера ===== */

interface ItemDto {
  id: number;
  rkcode: number | null;
  name: string | null;
  step: number;
  groupId: number;
  ruleId: number;
  avaliableForNative: number;
  actual: number;
  /** Количество в заказе; у позиции каталога его нет. */
  quantity?: number | null;
}

interface ItemGroupDto {
  id: number;
  name: string;
  items: ItemDto[];
}

interface LocationRulesDto {
  locations: { guid: string; name: string }[];
  rules: { id: number; name: string }[];
  /** Нет у сервера, который ещё не умеет считать доступные правила, — тогда показываем все. */
  availableRuleIds?: number[] | null;
}

interface OrderDto {
  id: number;
  creationDateTime: ServerDateTime;
  shipmentDateTime: ServerDateTime | null;
  locationGuid: string;
  ruleId: number;
  userName: string | null;
  items: ItemDto[] | null;
}

interface OrdersDto {
  location: string;
  locationGUID: string;
  officeOrders: OrderDto[] | null;
}

interface OrderContentsDto {
  /** Даты формирования и доставки — параллельными списками: i-я доставка относится к i-й дате формирования. */
  dateTimeMatches: { orderCreationDateTime: ServerDateTime[]; orderShipmentDateTime: ServerDateTime[] }[] | null;
  itemGroups: ItemGroupDto[];
  orderCreationDateTime: ServerDateTime;
  orderShipmentDateTime: ServerDateTime;
  orderItems: ItemDto[] | null;
}

const toItem = (dto: ItemDto): CatalogItem => ({
  id: dto.id,
  ruleId: dto.ruleId,
  groupId: dto.groupId,
  rkcode: dto.rkcode ?? null,
  name: dto.name ?? "",
  step: dto.step,
  forOwn: dto.avaliableForNative === 1,
  isActive: dto.actual !== 0,
});

const toItemDto = (item: CatalogItem): ItemDto => ({
  id: item.id,
  rkcode: item.rkcode,
  name: item.name,
  step: item.step,
  groupId: item.groupId,
  ruleId: item.ruleId,
  avaliableForNative: item.forOwn ? 1 : 0,
  actual: item.isActive ? 1 : 0,
});

const toGroup = (dto: ItemGroupDto): CatalogGroup => ({ id: dto.id, name: dto.name, items: dto.items.map(toItem) });

const toLine = (dto: ItemDto): OrderLine => ({
  itemId: dto.id,
  rkcode: dto.rkcode ?? null,
  name: dto.name ?? "",
  step: dto.step,
  quantity: typeof dto.quantity === "number" ? dto.quantity : null,
});

// дату, для которой сервер не смог посчитать доставку, он отдаёт как DateTime.MinValue — такие пропускаем
const NO_DATE = "0001-01-01";
const toDates = (matches: OrderContentsDto["dateTimeMatches"]) => (matches ?? []).flatMap((match) =>
  match.orderCreationDateTime.flatMap((creationDateTime, index) => {
    const shipmentDateTime = match.orderShipmentDateTime[index];
    return shipmentDateTime && !shipmentDateTime.startsWith(NO_DATE) ? [{ creationDateTime, shipmentDateTime }] : [];
  }));

const toLines = (items: ItemDto[] | null) => (items ?? []).map(toLine).sort((left, right) => left.name.localeCompare(right.name, "ru"));

/* ===== Ошибки ===== */

/** Текст ошибки для пользователя: причину отказа по заказу сервер объясняет сам. */
export function getOrdersErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 403) return "Нет доступа к этой торговой точке или действию.";
    if ((error.status === 400 || error.status === 409) && error.message) return error.message;
  }
  return getFriendlyErrorMessage(error, fallback);
}

/* ===== Заказы ===== */

export async function getOrdersBootstrap(): Promise<OrdersBootstrap> {
  const dto = await get<LocationRulesDto>("/Order/rules");
  return {
    rules: dto.rules.map((rule) => ({ id: rule.id, name: rule.name, hasItems: dto.availableRuleIds ? dto.availableRuleIds.includes(rule.id) : true })),
    stores: dto.locations.map((location) => ({ guid: location.guid, name: location.name })),
  };
}

/** Заказы типа по торговым точкам; storeGuid = null — по всем точкам пользователя. */
export async function getOrders(ruleId: number, storeGuid: string | null): Promise<StoreOrders[]> {
  const dto = await get<OrdersDto[]>(`/Order/rules/${ruleId}/orders`, { params: storeGuid ? { locationGuid: storeGuid } : undefined });
  return dto.map((group) => ({
    store: { guid: group.locationGUID, name: group.location },
    orders: (group.officeOrders ?? []).map((order): Order => ({
      id: order.id,
      ruleId: order.ruleId,
      storeGuid: group.locationGUID,
      storeName: group.location,
      creationDateTime: order.creationDateTime,
      shipmentDateTime: order.shipmentDateTime ?? null,
      userName: order.userName ?? "",
      lines: toLines(order.items),
    })),
  }));
}

/** Состав заказа: что и сколько. */
export async function getOrderLines(orderId: number): Promise<OrderLine[]> {
  return toLines(await get<ItemDto[]>(`/Order/orders/${orderId}/items`));
}

/** Данные редактора; без creationDateTime сервер берёт ближайшую дату формирования. */
export async function getOrderContents(ruleId: number, storeGuid: string, creationDateTime?: ServerDateTime | null): Promise<OrderContents> {
  const dto = await get<OrderContentsDto>(`/Order/rules/${ruleId}/locations/${storeGuid}/contents`, {
    params: creationDateTime ? { creationDateTime } : undefined,
  });
  return {
    dates: toDates(dto.dateTimeMatches),
    creationDateTime: dto.orderCreationDateTime,
    shipmentDateTime: dto.orderShipmentDateTime,
    groups: dto.itemGroups.map(toGroup),
    lines: toLines(dto.orderItems),
  };
}

/** Оформляет заказ на дату или заменяет состав уже оформленного на неё. Возвращает номер заказа. */
export async function saveOrder(draft: OrderDraft): Promise<number> {
  const saved = await post<{ id: number }>("/Order/orders", {
    creationDateTime: draft.creationDateTime,
    locationGuid: draft.storeGuid,
    ruleId: draft.ruleId,
    items: draft.lines.map((line) => ({ id: line.itemId, quantity: line.quantity })),
  });
  return saved.id;
}

/* ===== Настройки: каталог ===== */

/** Все позиции типа заказа, включая выключенные, по группам. */
export async function getCatalog(ruleId: number): Promise<CatalogGroup[]> {
  return (await get<ItemGroupDto[]>(`/Order/rules/${ruleId}/items`)).map(toGroup);
}

/** Создаёт позицию (id = 0) или сохраняет изменённую. */
export async function saveItem(item: CatalogItem): Promise<CatalogItem> {
  const dto = toItemDto(item);
  return toItem(item.id ? await put<ItemDto>(`/Order/items/${item.id}`, dto) : await post<ItemDto>("/Order/items", dto));
}
