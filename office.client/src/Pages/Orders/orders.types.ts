/** Дата и время в том виде, как их отдаёт сервер: «2026-10-13T12:00:00» — московское время без смещения. */
export type ServerDateTime = string;

/** Тип заказа (OfficeOrderRules). Расписание приёма и отгрузки ведёт бэкенд. */
export interface OrderRule {
  id: number;
  name: string;
  /** Есть хотя бы одна позиция, доступная пользователю: без них тип в списке заказов не показывается. */
  hasItems: boolean;
}

/** Торговая точка, привязанная к пользователю (Locations). */
export interface Store {
  guid: string;
  name: string;
}

/** С чего начинается раздел: типы заказов и торговые точки текущего пользователя. */
export interface OrdersBootstrap {
  rules: OrderRule[];
  stores: Store[];
}

/** Позиция каталога (OfficeOrderItem). */
export interface CatalogItem {
  id: number;
  ruleId: number;
  groupId: number;
  /** Код R-Keeper; уникален среди всех позиций. */
  rkcode: number | null;
  name: string;
  /** Кратность, может быть дробной (12,5 кг): количество меняется этим шагом; он же наименьшее количество в заказе. */
  step: number;
  /** Доступна роли «Заказы - Собственное управление»; остальным ролям раздела доступны все позиции. */
  forOwn: boolean;
  /** false — позиция выключена и в заказ не попадает. */
  isActive: boolean;
}

/** Группа каталога вместе со своими позициями — так каталог приходит с сервера. */
export interface CatalogGroup {
  id: number;
  name: string;
  items: CatalogItem[];
}

export interface OrderLine {
  itemId: number;
  rkcode: number | null;
  name: string;
  step: number;
  /** null — сервер не прислал количество. */
  quantity: number | null;
}

/** Заказ — заявка ТТ на одну дату формирования по типу заказа. На дату у ТТ один заказ. */
export interface Order {
  id: number;
  ruleId: number;
  storeGuid: string;
  storeName: string;
  /** Дата формирования: до этого момента заказ можно менять, после он уходит на сборку. */
  creationDateTime: ServerDateTime;
  /** Предполагаемая доставка; null — сервер не смог её посчитать. */
  shipmentDateTime: ServerDateTime | null;
  /** Кто оформил или последним менял заказ. */
  userName: string;
  lines: OrderLine[];
}

/** Заказы одной торговой точки — так список приходит с сервера. */
export interface StoreOrders {
  store: Store;
  orders: Order[];
}

export interface OrdersPermissions {
  /** Оформление и изменение заказов, у которых ещё не наступила дата формирования. */
  canEdit: boolean;
  /** Изменение заказов и после даты формирования — только администратор раздела. */
  canEditClosed: boolean;
  canConfigure: boolean;
}

/** Всё, что нужно редактору заказа для выбранных типа, торговой точки и даты формирования. */
export interface OrderContents {
  /** Даты на выбор — последняя прошедшая и ближайшие будущие, по возрастанию: формирование и доставка по нему. */
  dates: { creationDateTime: ServerDateTime; shipmentDateTime: ServerDateTime }[];
  /** Дата, для которой пришёл ответ; без запроса конкретной даты — ближайшая. */
  creationDateTime: ServerDateTime;
  /** Предполагаемая доставка для этой даты и торговой точки. */
  shipmentDateTime: ServerDateTime;
  /** Каталог: только позиции, доступные этой торговой точке. */
  groups: CatalogGroup[];
  /** Позиции уже оформленного на эту дату заказа; пусто — заказа нет. */
  lines: OrderLine[];
}

export interface OrderDraft {
  ruleId: number;
  storeGuid: string;
  creationDateTime: ServerDateTime;
  lines: { itemId: number; quantity: number }[];
}
