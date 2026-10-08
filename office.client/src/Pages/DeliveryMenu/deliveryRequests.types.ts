export interface RequestLocation {
  guid: string;
  name: string;
  rkCode: number | null;
  aggregatorsCode: number | null;
}

/** Ответ Яндекса портал не разбирает: показываем таблицу по факту и сырой JSON. */
export type YandexResponse = unknown;

export interface BlockPayload {
  locationGuid: string;
  from: string;
  to: string | null;
  message: string;
}

export interface BlockStatusPayload {
  locationGuid: string;
  statuses: string[];
  limit: number;
  offset: number;
}

export interface UnblockPayload {
  locationGuid: string;
  blockIds: string[];
}

export interface MenuImportPayload {
  locationGuid: string;
  operationType: string;
}

export interface OrdersHistoryPayload {
  locationGuid: string;
  from: string;
  to: string;
  statuses: string[];
  limit: number;
  offset: number;
}

export interface OrdersDetailsPayload {
  eatsIds: string[];
}

/** Запись журнала yeapi: один HTTP-запрос по заказу (от Яндекса или к нему) и ответ на него. */
export interface OrderLogEntry {
  id: number;
  /** HTTP-метод запроса. */
  type: string;
  clientId: string | null;
  ipAddress: string | null;
  url: string;
  /** Тело запроса — JSON строкой. */
  body: string | null;
  datetimeBegin: string;
  datetimeEnd: string | null;
  statusCode: number | null;
  errorText: string | null;
  order: string | null;
}
