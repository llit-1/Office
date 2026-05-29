import { beforeEach, describe, expect, it } from "vitest";
import authReducer, { login, logout } from "../../Store/authSlice";

describe("authSlice", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("stores login payload", () => {
    const state = authReducer(
      undefined,
      login({ id: 5, token: "token", phone: "123", code: "9999" })
    );

    expect(state).toEqual({
      id: 5,
      token: "token",
      phone: "123",
      code: "9999",
    });
  });

  it("clears auth state and localStorage on logout", () => {
    localStorage.setItem("token", "token");
    localStorage.setItem("authToken", "legacy");
    localStorage.setItem("id", "7");

    const state = authReducer(
      { id: 7, token: "token", phone: "123", code: "1111" },
      logout()
    );

    expect(state).toEqual({
      id: null,
      token: null,
      phone: "",
      code: null,
    });
    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("authToken")).toBeNull();
    expect(localStorage.getItem("id")).toBeNull();
  });
});
