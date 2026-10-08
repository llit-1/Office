import { ApiError, get, getFriendlyErrorMessage, post } from "../../Services/api";
import type {
  StockHolderForm,
  StockHolderOption,
  StockLookups,
  StockObject,
  StockObjectCard,
  StockSearchGroup,
  StockSearchRequest,
  StockTransferRequest,
} from "./stock.types";

let lookupsRequest: Promise<StockLookups> | null = null;

/** Справочники общие для вкладок, поэтому загружаются один раз за сессию страницы. */
export function getStockLookups(force = false): Promise<StockLookups> {
  if (force || !lookupsRequest) {
    lookupsRequest = get<StockLookups>("/stock/lookups").catch((error: unknown) => {
      lookupsRequest = null;
      throw error;
    });
  }

  return lookupsRequest;
}

export async function createStockHolder(form: StockHolderForm): Promise<StockHolderOption | null> {
  const created = await post<StockHolderOption | "" | null>("/stock/holders", form);
  lookupsRequest = null;
  return created || null;
}

export const searchStock = (request: StockSearchRequest) =>
  post<StockSearchGroup[]>("/stock/search", request);

export const getStockObjectCard = (code: string) =>
  get<StockObjectCard>(`/stock/objects/${encodeURIComponent(code)}`);

export const getStockObjectSummary = (code: string) =>
  get<StockObject>(`/stock/objects/${encodeURIComponent(code)}/summary`);

export const sendStockTransfer = (request: StockTransferRequest) =>
  post<{ count: number }>("/stock/transfers", request);

export const writeOffStockObject = (code: string, comment: string) =>
  post<void>(`/stock/objects/${encodeURIComponent(code)}/write-off`, { comment });

const SERVER_MESSAGE_STATUSES = new Set([400, 404, 409, 422, 502, 503]);

/** Сервер склада формулирует ошибки для пользователя — показываем их вместо общих текстов по HTTP-коду. */
export function getStockErrorMessage(error: unknown, fallback: string): string {
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
