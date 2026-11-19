import { beforeEach, describe, expect, it } from "vitest";
import authReducer, { login, logout } from "../../Store/authSlice";

describe("authSlice", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores login payload", () => {
    const state = authReducer(
      undefined,
      login({ id: 5, token: "token", fullName: "Иванов Иван", position: "Инженер" }),
    );

    expect(state).toEqual({
      id: 5,
      token: "token",
      fullName: "Иванов Иван",
      position: "Инженер",
      impersonatedBy: null,
      initialized: true,
    });
  });

  it("keeps who is impersonating and drops it on the next regular session", () => {
    const impersonated = authReducer(undefined, login({ id: 2, token: "t", impersonatedBy: "Иванов Иван" }));
    expect(impersonated.impersonatedBy).toBe("Иванов Иван");

    const back = authReducer(impersonated, login({ id: 1, token: "t2" }));
    expect(back.impersonatedBy).toBeNull();
  });

  it("clears auth state and localStorage on logout", () => {
    localStorage.setItem("token", "token");
    localStorage.setItem("authToken", "legacy");
    localStorage.setItem("id", "7");

    const state = authReducer(
      { id: 7, token: "token", fullName: "Иванов Иван", position: "Инженер", initialized: true },
      logout(),
    );

    expect(state).toEqual({
      id: null,
      token: null,
      fullName: null,
      position: null,
      impersonatedBy: null,
      initialized: true,
    });
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("authToken")).toBeNull();
    expect(localStorage.getItem("id")).toBeNull();
  });
});
