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

export interface AuthRequestConfig extends AxiosRequestConfig {
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
let scheduledRefreshTimer: number | null = null;

const AUTH_CHALLENGE_HEADER = "x-office-auth-challenge";
const ACCESS_TOKEN_REFRESH_LEEWAY_MS = 60_000;
const TRANSIENT_REFRESH_RETRY_MS = 30_000;

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
  scheduleAccessTokenRefresh(accessToken);
}

export function clearAccessToken() {
  accessToken = null;
  clearScheduledRefresh();
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

export function isTerminalSessionRefreshError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function hasOfficeAuthChallenge(error: AxiosError): boolean {
  const headers = error.response?.headers;
  const officeChallenge = typeof headers?.get === "function"
    ? headers.get(AUTH_CHALLENGE_HEADER)
    : headers?.[AUTH_CHALLENGE_HEADER];
  if (String(officeChallenge ?? "") === "1") {
    return true;
  }

  const authenticateHeader = typeof headers?.get === "function"
    ? headers.get("www-authenticate")
    : headers?.["www-authenticate"];
  return String(authenticateHeader ?? "").toLowerCase().includes("bearer");
}

function clearScheduledRefresh() {
  if (scheduledRefreshTimer !== null) {
    window.clearTimeout(scheduledRefreshTimer);
    scheduledRefreshTimer = null;
  }
}

function decodeAccessTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const payloadPart = token.split(".")[1];
    if (!payloadPart) return null;

    const normalized = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(window.atob(padded)) as unknown;
    return payload && typeof payload === "object"
      ? payload as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

const ACCESS_TOKEN_ROLE_CLAIMS = [
  "role",
  "roles",
  "http://schemas.microsoft.com/ws/2008/06/identity/claims/role",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role",
];

function normalizeRoles(roles: readonly string[]) {
  return Array.from(new Set(
    roles
      .map((role) => role.trim().toLocaleLowerCase())
      .filter(Boolean),
  )).sort();
}

export function getAccessTokenRoles(token: string | null = accessToken): string[] {
  if (!token) return [];

  const payload = decodeAccessTokenPayload(token);
  if (!payload) return [];

  const roles = ACCESS_TOKEN_ROLE_CLAIMS.flatMap((claimName) => {
    const value = payload[claimName];
    if (Array.isArray(value)) {
      return value.filter((role): role is string => typeof role === "string");
    }

    return typeof value === "string" ? [value] : [];
  });

  const seen = new Set<string>();
  return roles.filter((role) => {
    const normalizedRole = role.trim().toLocaleLowerCase();
    if (!normalizedRole || seen.has(normalizedRole)) return false;
    seen.add(normalizedRole);
    return true;
  });
}

export function accessTokenRolesMatch(token: string | null, roles: readonly string[]) {
  const tokenRoles = normalizeRoles(getAccessTokenRoles(token));
  const expectedRoles = normalizeRoles(roles);
  return tokenRoles.length === expectedRoles.length
    && tokenRoles.every((role, index) => role === expectedRoles[index]);
}

function getAccessTokenExpirationMs(token: string): number | null {
  const payload = decodeAccessTokenPayload(token);
  return typeof payload?.exp === "number" ? payload.exp * 1000 : null;
}

function scheduleAccessTokenRefresh(token: string | null) {
  clearScheduledRefresh();
  if (!token) return;

  const expiresAtMs = getAccessTokenExpirationMs(token);
  if (expiresAtMs === null) return;

  const delay = Math.max(0, expiresAtMs - Date.now() - ACCESS_TOKEN_REFRESH_LEEWAY_MS);
  scheduledRefreshTimer = window.setTimeout(() => {
    scheduledRefreshTimer = null;
    void refreshAccessTokenInBackground();
  }, delay);
}

async function refreshAccessTokenInBackground() {
  try {
    await requestSessionRefresh();
  } catch (error) {
    if (isTerminalSessionRefreshError(error)) {
      clearAccessToken();
      redirectToLogin();
      return;
    }

    scheduledRefreshTimer = window.setTimeout(() => {
      scheduledRefreshTimer = null;
      void refreshAccessTokenInBackground();
    }, TRANSIENT_REFRESH_RETRY_MS);
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
  } catch (error) {
    if (isTerminalSessionRefreshError(error)) {
      clearAccessToken();
      return null;
    }

    throw error;
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

    const isAuthChallenge = status === 401 && hasOfficeAuthChallenge(error);

    const shouldRefreshAuthorization = (isAuthChallenge || status === 403)
      && originalRequest
      && !originalRequest.skipAuthRefresh
      && !originalRequest._retry;

    if (shouldRefreshAuthorization) {
      originalRequest._retry = true;

      try {
        const session = await requestSessionRefresh();
        originalRequest.headers = originalRequest.headers ?? {};
        originalRequest.headers.Authorization = `Bearer ${session.token}`;
        return await api.request(originalRequest);
      } catch (refreshError) {
        if (isTerminalSessionRefreshError(refreshError)) {
          clearAccessToken();
          if (!originalRequest.skipAuthRedirect) {
            redirectToLogin();
          }
        }

        return Promise.reject(refreshError);
      }
    } else if (isAuthChallenge && !originalRequest?.skipAuthRedirect) {
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

export async function get<T = unknown>(url: string, config?: AuthRequestConfig): Promise<T> {
  const res = await api.get<T>(url, config);
  return res as unknown as T;
}

export async function post<T = unknown>(url: string, data?: unknown, config?: AuthRequestConfig): Promise<T> {
  const res = await api.post<T>(url, data, config);
  return res as unknown as T;
}

export async function put<T = unknown>(url: string, data?: unknown, config?: AuthRequestConfig): Promise<T> {
  const res = await api.put<T>(url, data, config);
  return res as unknown as T;
}

export async function patch<T = unknown>(url: string, data?: unknown, config?: AuthRequestConfig): Promise<T> {
  const res = await api.patch<T>(url, data, config);
  return res as unknown as T;
}

export async function del<T = unknown>(url: string, config?: AuthRequestConfig): Promise<T> {
  const res = await api.delete<T>(url, config);
  return res as unknown as T;
}
