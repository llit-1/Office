import type { OrderLogEntry } from "./deliveryRequests.types";

/** Что делал запрос — по методу и адресу yeapi, который вызывал Яндекс. */
export function describeLogEntry(entry: Pick<OrderLogEntry, "type" | "url">): string {
  const method = entry.type.toUpperCase();
  const path = entry.url.split("?")[0].toLowerCase();

  if (path.endsWith("/status")) return method === "GET" ? "Запрос статуса" : "Смена статуса";
  if (path.endsWith("/courier")) return "Данные курьера";
  if (/^\/order\/?$/.test(path) && method === "POST") return "Создание заказа";
  if (path.startsWith("/order/")) {
    if (method === "DELETE") return "Отмена заказа";
    if (method === "PUT") return "Изменение заказа";
    if (method === "GET") return "Запрос заказа";
  }
  return `${method} ${entry.url}`;
}

/** Из ответа ASP.NET с ошибками валидации достаём понятный список «поле: сообщение». */
export function errorSummary(errorText: string | null): string[] {
  if (!errorText?.trim()) return [];
  try {
    const parsed = JSON.parse(errorText) as { title?: unknown; message?: unknown; errors?: Record<string, unknown> };
    const fieldErrors = parsed.errors && typeof parsed.errors === "object"
      ? Object.entries(parsed.errors).flatMap(([field, messages]) =>
        (Array.isArray(messages) ? messages : [messages]).map((message) => `${field}: ${String(message)}`))
      : [];
    if (fieldErrors.length > 0) return fieldErrors;
    const title = [parsed.message, parsed.title].find((value): value is string => typeof value === "string" && value.trim() !== "");
    return title ? [title] : [errorText.length > 200 ? `${errorText.slice(0, 200)}…` : errorText];
  } catch {
    return [errorText.length > 200 ? `${errorText.slice(0, 200)}…` : errorText];
  }
}
