import axios, { AxiosInstance } from "axios";
import type { UseFormSetError } from "react-hook-form";
import type { AxiosRequestConfig } from "axios";

export class ApiError extends Error {
  status?: number;
  data?: unknown;
  fieldErrors?: Record<string, string[]> | undefined;
  isApiError = true;

  constructor(message?: string, status?: number, data?: unknown, fieldErrors?: Record<string, string[]>) {
    super(message ?? "Api error");
    this.status = status;
    this.data = data;
    this.fieldErrors = fieldErrors;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

const api: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "",
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor: attach token if present
api.interceptors.request.use(
  (config) => {
    try {
      const token = localStorage.getItem("token");
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // ignore
    }
    return config;
  },
  (error) => Promise.reject(error)
);

function extractFieldErrors(data: unknown): Record<string, string[]> | undefined {
  if (!data || typeof data !== "object") return undefined;

  const obj = data as Record<string, unknown>;

  // Common ASP.NET Core validation response shape: { errors: { Field: ["msg"] } }
  if (obj["errors"] && typeof obj["errors"] === "object") {
    return obj["errors"] as Record<string, string[]>;
  }

  // Some APIs use 'ModelState' or 'validationErrors'
  if (obj["ModelState"] && typeof obj["ModelState"] === "object") {
    return obj["ModelState"] as Record<string, string[]>;
  }

  if (obj["validationErrors"] && typeof obj["validationErrors"] === "object") {
    return obj["validationErrors"] as Record<string, string[]>;
  }

  return undefined;
}

// Response interceptor: unwrap data and handle common errors
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const status = error?.response?.status;
    const data = error?.response?.data;
    if (status === 401) {
      try {
        localStorage.removeItem("token");
      } catch {
        // ignore
      }
    }

    const fieldErrors = extractFieldErrors(data);
    const message = (data && (data.message || data.title || data.detail)) || error.message || "Ошибка API";

    return Promise.reject(new ApiError(message, status, data, fieldErrors));
  }
);

export default api;

export function getFriendlyErrorMessage(err: unknown, fallback = "Ошибка сервера") {
  // Prefer ApiError with status
  if (err instanceof ApiError) {
    const ae = err as ApiError;
    const status = ae.status;
    // If fieldErrors exist, prefer general message if present
    if (status) {
      switch (status) {
        case 400:
          return ae.message || "Неверные данные запроса.";
        case 401:
          return "Требуется авторизация. Пожалуйста, войдите в систему.";
        case 403:
          return "Доступ запрещён.";
        case 404:
          return "Ресурс не найден.";
        case 405:
          return "Метод запроса не поддерживается сервером.";
        case 409:
          return "Конфликт данных на сервере.";
        case 422:
          return ae.message || "Ошибка валидации данных.";
        case 500:
        default:
          return ae.message || "Внутренняя ошибка сервера.";
      }
    }

    return ae.message || fallback;
  }

  // axios/network error shapes
  const maybeObj = err as Record<string, unknown> | undefined;
  if (maybeObj && typeof maybeObj === "object") {
    const msg = maybeObj["message"] as string | undefined;
    if (msg) {
      if (msg.includes("Network Error")) return "Сервер недоступен. Проверьте подключение.";
      if (msg.includes("timeout")) return "Превышено время ожидания запроса.";
    }
  }

  return fallback;
}

export async function callApi<T>(
  promise: Promise<T>,
  options?: {
    notifications?: { show: (text: string, opts?: Record<string, unknown> | undefined) => void } | undefined;
    setError?: UseFormSetError<Record<string, unknown>> | undefined;
    successMessage?: string | undefined;
  },
): Promise<{ ok: true; data: T } | { ok: false; error: ApiError }> {
  try {
    const data = await promise;
    if (options?.successMessage && options?.notifications) {
      options.notifications.show(options.successMessage, { severity: "success", autoHideDuration: 3000 });
    }
    return { ok: true, data };
  } catch (err: unknown) {
    const friendly = getFriendlyErrorMessage(err);
    if (options?.notifications) {
      options.notifications.show(friendly, { severity: "error", autoHideDuration: 5000 });
    }

    if (err instanceof ApiError) {
      const ae = err as ApiError;
      if (ae.fieldErrors && options?.setError) {
        for (const key of Object.keys(ae.fieldErrors)) {
          const msgs = ae.fieldErrors[key];
          const first = Array.isArray(msgs) && msgs.length ? msgs[0] : String(msgs);
          const seg = key.split(".").pop() || key;
          const fieldName = seg.charAt(0).toLowerCase() + seg.slice(1);
          try {
            options.setError(fieldName, { type: "server", message: first });
          } catch {
            // ignore mapping errors
          }
        }
      }
      return { ok: false, error: ae };
    }

    return { ok: false, error: new ApiError(String(err)) };
  }
}

// Convenience typed helpers that return the unwrapped response body `T`.
export async function get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.get<T>(url, config);
  return res as unknown as T;
}

export async function post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.post<T>(url, data, config);
  return res as unknown as T;
}

export async function put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.put<T>(url, data, config);
  return res as unknown as T;
}

export async function del<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res = await api.delete<T>(url, config);
  return res as unknown as T;
}
