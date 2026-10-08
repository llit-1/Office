import { ApiError, get, getFriendlyErrorMessage, post } from "../../Services/api";
import type {
  BlockPayload,
  BlockStatusPayload,
  MenuImportPayload,
  OrdersDetailsPayload,
  OrdersHistoryPayload,
  OrderLogEntry,
  RequestLocation,
  UnblockPayload,
  YandexResponse,
} from "./deliveryRequests.types";

const baseUrl = "/DeliveryRequests";

export const getRequestLocations = () => get<RequestLocation[]>(`${baseUrl}/locations`);

export const blockRestaurant = (payload: BlockPayload) => post<YandexResponse>(`${baseUrl}/block`, payload);

export const getBlockStatus = (payload: BlockStatusPayload) => post<YandexResponse>(`${baseUrl}/block/status`, payload);

export const unblockRestaurant = (payload: UnblockPayload) => post<YandexResponse>(`${baseUrl}/unblock`, payload);

export const importMenu = (payload: MenuImportPayload) => post<YandexResponse>(`${baseUrl}/menu/import`, payload);

/** Подгрузка продаж Яндекса за день в нашу базу; date — «yyyy-MM-dd». */
export const loadSales = (date: string) => post<YandexResponse>(`${baseUrl}/sales/load`, { date });

export const getOrdersHistory = (payload: OrdersHistoryPayload) => post<YandexResponse>(`${baseUrl}/orders/history`, payload);

export const getOrderLogs = (eatsId: string) =>
  get<OrderLogEntry[]>(`${baseUrl}/orders/${encodeURIComponent(eatsId)}/logs`);

export const getOrdersDetails = (payload: OrdersDetailsPayload) => post<YandexResponse>(`${baseUrl}/orders/details`, payload);

const SERVER_MESSAGE_STATUSES = new Set([400, 404, 409, 422, 502]);

/** Сервер и Яндекс формулируют ошибки сами — показываем их вместо общих текстов по HTTP-коду. */
export function getRequestErrorMessage(error: unknown, fallback: string): string {
  if (
    error instanceof ApiError
    && error.status
    && SERVER_MESSAGE_STATUSES.has(error.status)
    && error.message
    && !error.message.startsWith("Request failed")
  ) {
    return error.message;
  }

  return getFriendlyErrorMessage(error, fallback);
}
