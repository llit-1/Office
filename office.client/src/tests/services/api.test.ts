import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from "axios";
import api, {
  ApiError,
  callApi,
  clearAccessToken,
  accessTokenRolesMatch,
  get,
  getAccessToken,
  getAccessTokenRoles,
  getFriendlyErrorMessage,
  isTerminalSessionRefreshError,
  refreshSession,
  setAccessToken,
} from "../../Services/api";

const originalAdapter = api.defaults.adapter;

function unauthorizedError(
  config: InternalAxiosRequestConfig,
  headers: Record<string, string> = {},
) {
  return new AxiosError(
    "Unauthorized",
    AxiosError.ERR_BAD_REQUEST,
    config,
    undefined,
    {
      data: { message: "Unauthorized" },
      status: 401,
      statusText: "Unauthorized",
      headers: new AxiosHeaders(headers),
      config,
    },
  );
}

function forbiddenError(config: InternalAxiosRequestConfig) {
  return new AxiosError(
    "Forbidden",
    AxiosError.ERR_BAD_REQUEST,
    config,
    undefined,
    {
      data: { message: "Forbidden" },
      status: 403,
      statusText: "Forbidden",
      headers: new AxiosHeaders(),
      config,
    },
  );
}

function createUnsignedToken(payload: Record<string, unknown>) {
  const encodedPayload = window.btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `header.${encodedPayload}.signature`;
}

describe("api helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    api.defaults.adapter = originalAdapter;
    clearAccessToken();
  });

  it("returns friendly message for unauthorized api error", () => {
    expect(getFriendlyErrorMessage(new ApiError("x", 401))).toContain(
      "авториза"
    );
  });

  it("returns fallback for unknown errors", () => {
    expect(getFriendlyErrorMessage(new Error("boom"), "fallback")).toBe(
      "fallback"
    );
  });

  it("treats only authorization responses as terminal refresh failures", () => {
    expect(isTerminalSessionRefreshError(new ApiError("unauthorized", 401))).toBe(true);
    expect(isTerminalSessionRefreshError(new ApiError("forbidden", 403))).toBe(true);
    expect(isTerminalSessionRefreshError(new ApiError("server", 500))).toBe(false);
    expect(isTerminalSessionRefreshError(new ApiError("network"))).toBe(false);
  });

  it("reads and compares role claims from an access token", () => {
    const token = createUnsignedToken({
      role: ["Sensors", "Users"],
      "http://schemas.microsoft.com/ws/2008/06/identity/claims/role": "sensors",
    });

    expect(getAccessTokenRoles(token)).toEqual(["Sensors", "Users"]);
    expect(accessTokenRolesMatch(token, ["users", "Sensors"])).toBe(true);
    expect(accessTokenRolesMatch(token, ["Users"])).toBe(false);
  });

  it("preserves the access token when refresh fails transiently", async () => {
    setAccessToken("existing-token");
    api.defaults.adapter = async (config) => {
      throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config);
    };

    await expect(refreshSession()).rejects.toBeInstanceOf(ApiError);
    expect(getAccessToken()).toBe("existing-token");
  });

  it("does not refresh or clear the session for a regular business 401", async () => {
    const requestedUrls: string[] = [];
    setAccessToken("existing-token");
    api.defaults.adapter = async (config) => {
      requestedUrls.push(config.url ?? "");
      throw unauthorizedError(config);
    };

    await expect(get("/business-operation")).rejects.toBeInstanceOf(ApiError);
    expect(requestedUrls).toEqual(["/business-operation"]);
    expect(getAccessToken()).toBe("existing-token");
  });

  it("refreshes and retries when the Office JWT challenge is present", async () => {
    const requestedUrls: string[] = [];
    let protectedRequestCount = 0;
    setAccessToken("expired-token");
    api.defaults.adapter = async (config) => {
      requestedUrls.push(config.url ?? "");

      if (config.url === "/Authorization/refresh") {
        return {
          data: { id: 7, token: "fresh-token", responseCode: 1 },
          status: 200,
          statusText: "OK",
          headers: new AxiosHeaders(),
          config,
        };
      }

      protectedRequestCount += 1;
      if (protectedRequestCount === 1) {
        throw unauthorizedError(config, { "X-Office-Auth-Challenge": "1" });
      }

      return {
        data: { ok: true },
        status: 200,
        statusText: "OK",
        headers: new AxiosHeaders(),
        config,
      };
    };

    await expect(get("/protected-operation")).resolves.toEqual({ ok: true });
    expect(requestedUrls).toEqual([
      "/protected-operation",
      "/Authorization/refresh",
      "/protected-operation",
    ]);
    expect(getAccessToken()).toBe("fresh-token");
  });

  it("refreshes and retries once when roles in the access token are stale", async () => {
    const requestedUrls: string[] = [];
    let protectedRequestCount = 0;
    setAccessToken("token-with-old-roles");
    api.defaults.adapter = async (config) => {
      requestedUrls.push(config.url ?? "");

      if (config.url === "/Authorization/refresh") {
        return {
          data: { id: 7, token: "token-with-current-roles", responseCode: 1 },
          status: 200,
          statusText: "OK",
          headers: new AxiosHeaders(),
          config,
        };
      }

      protectedRequestCount += 1;
      if (protectedRequestCount === 1) {
        throw forbiddenError(config);
      }

      return {
        data: { ok: true },
        status: 200,
        statusText: "OK",
        headers: new AxiosHeaders(),
        config,
      };
    };

    await expect(get("/Sensors/getall")) .resolves.toEqual({ ok: true });
    expect(requestedUrls).toEqual([
      "/Sensors/getall",
      "/Authorization/refresh",
      "/Sensors/getall",
    ]);
    expect(getAccessToken()).toBe("token-with-current-roles");
  });

  it("returns successful callApi result", async () => {
    const result = await callApi(Promise.resolve({ ok: 1 }));

    expect(result).toEqual({ ok: true, data: { ok: 1 } });
  });

  it("returns ApiError from failed callApi and notifies", async () => {
    const show = vi.fn();
    const error = new ApiError("Forbidden", 403);

    const result = await callApi(Promise.reject(error), {
      notifications: { show },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
    }
    expect(show).toHaveBeenCalled();
  });
});
