import { beforeEach, describe, expect, it, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Login from "../../Pages/Login/Login";
import authReducer from "../../Store/authSlice";

const showMock = vi.fn();
const authMock = vi.fn();

vi.mock("@toolpad/core", () => ({
  useNotifications: () => ({ show: showMock }),
}));

vi.mock("../../Pages/Requests", () => ({
  Auth: (...args: unknown[]) => authMock(...args),
}));

function renderLogin() {
  const store = configureStore({
    reducer: {
      auth: authReducer,
    },
  });

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/Login"]}>
        <Routes>
          <Route path="/Login" element={<Login />} />
          <Route path="/Main" element={<div>Main page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );

  return { store };
}

function fillCredentials() {
  const usernameInput = document.querySelector(
    'input[autocomplete="username"]'
  ) as HTMLInputElement;
  const passwordInput = document.querySelector(
    'input[autocomplete="current-password"]'
  ) as HTMLInputElement;

  fireEvent.change(usernameInput, { target: { value: "user" } });
  fireEvent.change(passwordInput, { target: { value: "pass" } });
}

describe("Login", () => {
  beforeEach(() => {
    localStorage.clear();
    showMock.mockReset();
    authMock.mockReset();
  });

  it("clears persisted auth data on mount", () => {
    localStorage.setItem("token", "token");
    localStorage.setItem("authToken", "legacy");
    localStorage.setItem("user", "user");
    localStorage.setItem("userId", "1");
    localStorage.setItem("userRole", "Admin");

    renderLogin();

    expect(localStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("authToken")).toBeNull();
    expect(localStorage.getItem("user")).toBeNull();
    expect(localStorage.getItem("userId")).toBeNull();
    expect(localStorage.getItem("userRole")).toBeNull();
  });

  it("stores auth data and navigates on successful login", async () => {
    authMock.mockResolvedValue({
      id: 7,
      token: "jwt-token",
      responseCode: 1,
    });

    renderLogin();
    fillCredentials();

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByText("Main page")).toBeInTheDocument();
    });

    expect(localStorage.getItem("token")).toBe("jwt-token");
    expect(localStorage.getItem("id")).toBe("7");
  });

  it("shows a modal for inactive accounts", async () => {
    authMock.mockResolvedValue({
      id: 7,
      token: "jwt-token",
      responseCode: 0,
    });

    renderLogin();
    fillCredentials();

    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    expect(screen.queryByText("Main page")).not.toBeInTheDocument();
  });
});
