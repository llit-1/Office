import axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  InternalAxiosRequestConfig,
} from "axios";
import type { UseFormSetError } from "react-hook-form";
import type { AuthAnswer } from "../Interfaces/AuthAnswer";

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

interface AuthRequestConfig extends AxiosRequestConfig {
  _retry?: boolean;
  skipAuthRefresh?: boolean;
  skipAuthRedirect?: boolean;
}

interface AuthInternalRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
  skipAuthRefresh?: boolean;
  skipAuthRedirect?: boolean;
}

let accessToken: string | null = null;
let refreshPromise: Promise<AuthAnswer> | null = null;

function resolveApiBaseUrl() {
  const overrideUrl = import.meta.env.VITE_API_URL?.trim();
  if (overrideUrl) {
    return overrideUrl;
  }

  if (import.meta.env.VITE_DEV === "1") {
    const devHost = import.meta.env.VITE_DEV_HOST?.trim().replace(/\/+$/, "");
    return devHost ? `${devHost}/api` : "/api";
  }

  const prodApiUrl = import.meta.env.VITE_PROD_API_URL?.trim();
  return prodApiUrl || "/api";
}

export function getApiBaseUrl() {
  return api.defaults.baseURL || "/api";
}

const api: AxiosInstance = axios.create({
  baseURL: resolveApiBaseUrl(),
  timeout: 60000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export function getAccessToken() {
  return accessToken;
}

export function setAccessToken(token: string | null) {
  accessToken = token?.trim() ? token : null;
}

export function clearAccessToken() {
  accessToken = null;
  try {
    localStorage.removeItem("token");
    localStorage.removeItem("authToken");
    localStorage.removeItem("id");
    localStorage.removeItem("userId");
    localStorage.removeItem("login");
    localStorage.removeItem("userFullName");
    localStorage.removeItem("userPosition");
  } catch {
    // ignore storage cleanup errors
  }
}

function redirectToLogin() {
  const loginPath = "/Login";
  if (window.location.pathname !== loginPath) {
    window.location.replace(loginPath);
  }
}

async function requestSessionRefresh(): Promise<AuthAnswer> {
  if (!refreshPromise) {
    refreshPromise = post<AuthAnswer>("/Authorization/refresh", undefined, {
        skipAuthRefresh: true,
        skipAuthRedirect: true,
      } as AuthRequestConfig)
      .then((session) => {
        setAccessToken(session.token);
        return session;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise!;
}

export async function refreshSession(): Promise<AuthAnswer | null> {
  try {
    return await requestSessionRefresh();
  } catch {
    clearAccessToken();
    return null;
  }
}

export async function logoutSession() {
  try {
    await api.post("/Authorization/logout", undefined, {
      skipAuthRefresh: true,
      skipAuthRedirect: true,
    } as AuthRequestConfig);
  } finally {
    clearAccessToken();
  }
}

api.interceptors.request.use(
  (config: AuthInternalRequestConfig) => {
    if (accessToken && config.headers) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

function extractFieldErrors(data: unknown): Record<string, string[]> | undefined {
  if (!data || typeof data !== "object") return undefined;

  const obj = data as Record<string, unknown>;

  if (obj["errors"] && typeof obj["errors"] === "object") {
    return obj["errors"] as Record<string, string[]>;
  }

  if (obj["ModelState"] && typeof obj["ModelState"] === "object") {
    return obj["ModelState"] as Record<string, string[]>;
  }

  if (obj["validationErrors"] && typeof obj["validationErrors"] === "object") {
    return obj["validationErrors"] as Record<string, string[]>;
  }

  return undefined;
}

api.interceptors.response.use(
  (response) => response.data,
  async (error: AxiosError) => {
    const status = error.response?.status;
    const data = error.response?.data as Record<string, unknown> | undefined;
    const originalRequest = error.config as AuthRequestConfig | undefined;

    if (status === 401 && originalRequest && !originalRequest.skipAuthRefresh && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const session = await requestSessionRefresh();
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${session.token}`;
        return await api.request(originalRequest);
      } catch {
        clearAccessToken();
        if (!originalRequest.skipAuthRedirect) {
          redirectToLogin();
        }
      }
    } else if (status === 401 && !originalRequest?.skipAuthRedirect) {
      clearAccessToken();
      redirectToLogin();
    }

    const fieldErrors = extractFieldErrors(data);
    const message =
      (data && (data.message || data.title || data.detail)) ||
      error.message ||
      "Ошибка API";

    return Promise.reject(new ApiError(String(message), status, data, fieldErrors));
  },
);

export default api;

export function getFriendlyErrorMessage(err: unknown, fallback = "Ошибка сервера") {
  if (err instanceof ApiError) {
    const status = err.status;
    if (status) {
      switch (status) {
        case 400:
          return err.message || "Неверные данные запроса.";
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
          return err.message || "Ошибка валидации данных.";
        case 500:
        default:
          return err.message || "Внутренняя ошибка сервера.";
      }
    }

    return err.message || fallback;
  }

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
    const isUnauthorized = err instanceof ApiError && err.status === 401;
    if (options?.notifications && !isUnauthorized) {
      options.notifications.show(friendly, { severity: "error", autoHideDuration: 5000 });
    }

    if (err instanceof ApiError) {
      if (err.fieldErrors && options?.setError) {
        for (const key of Object.keys(err.fieldErrors)) {
          const msgs = err.fieldErrors[key];
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
      return { ok: false, error: err };
    }

    return { ok: false, error: new ApiError(String(err)) };
  }
}

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
