/** Дата без времени в формате YYYY-MM-DD. Все даты доставки — московские календарные дни. */
export type DayString = string;

export type ManagementType = "own" | "partner";

/**
 * Вкладка заказов (OfficeOrderTypes). Вся логика дат — в трёх полях:
 * когда закрывается приём, какой день служит якорем доставки и на сколько дней от него сдвигаемся.
 */
export interface OrderTypeConfig {
  id: number;
  name: string;
  isActive: boolean;
  /** Крон закрытия приёма: «0 12 * * *» — каждый день в 12:00. Время московское. */
  closeCron: string;
  /** Крон дня-якоря: день доставки или понедельник недели доставки. */
  deliveryCron: string;
  /** Сдвиг от якоря по умолчанию: 1 / 2 / 3 у регулярных, 0 у остальных. */
  offsetDays: number;
}

/** Свой сдвиг от якоря у торговой точки (OfficeOrderDeliveryDays). Для недели 0 = пн … 6 = вс. */
export interface DeliveryDay {
  typeId: number;
  storeId: number;
  offsetDays: number;
}

export interface CatalogGroup {
  id: number;
  typeId: number;
  name: string;
}

export interface CatalogItem {
  id: number;
  groupId: number;
  article: string;
  name: string;
  /** Кратность (она же минимальный заказ). */
  step: number;
  /** Максимум на один заказ; null — общий лимит. */
  maxQuantity: number | null;
  isActive: boolean;
  forOwn: boolean;
  forPartner: boolean;
  /** Последняя цена отгрузки из 1С; null — отгрузок за период не было. */
  price: number | null;
}

export interface Store {
  id: number;
  code: number;
  name: string;
  management: ManagementType;
  closed: boolean;
}

export interface UserRef {
  id: number;
  name: string;
}

export interface OrderLine {
  productId: number;
  article: string;
  name: string;
  groupName: string;
  quantity: number;
  step: number;
  price: number | null;
}

/** Заказ — заявка ТТ на конкретную доставку вкладки. На одну доставку у ТТ один заказ. */
export interface Order {
  id: number;
  typeId: number;
  storeId: number;
  storeName: string;
  /** Посчитана один раз при создании. */
  deliveryDate: DayString;
  /** До этого момента заказ можно менять и отменять. */
  closeAt: string;
  lines: OrderLine[];
  createdAt: string;
  createdBy: UserRef;
  cancelledAt: string | null;
  cancelledBy: UserRef | null;
}

export type OrderStatus = "open" | "locked" | "done" | "cancelled";

export interface OrdersPermissions {
  /** Оформление, изменение и отмена открытых заказов. */
  canEdit: boolean;
  /** Отмена заказов, которые уже переданы в работу. */
  canManageLocked: boolean;
  canConfigure: boolean;
}

export interface OrdersBootstrap {
  types: OrderTypeConfig[];
  stores: Store[];
  deliveryDays: DeliveryDay[];
}

export interface Catalog {
  groups: CatalogGroup[];
  items: CatalogItem[];
}

export interface OrderDraft {
  /** Id существующего заказа при изменении. */
  id: number | null;
  typeId: number;
  storeId: number;
  lines: OrderLine[];
}

export type SaveOrderResult =
  | { ok: true; order: Order }
  | { ok: false; message: string };
