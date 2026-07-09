import { beforeEach, describe, expect, it } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import RequireAuth from "../../App/RequireAuth";

function renderWithAuthState(preloadedState: unknown, initialEntry = "/protected") {
  const store = configureStore({
    reducer: () => preloadedState,
    preloadedState,
  });

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route
            path="/protected"
            element={
              <RequireAuth>
                <div>Protected page</div>
              </RequireAuth>
            }
          />
          <Route path="/Login" element={<div>Login page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("RequireAuth", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders children when token exists in the store", () => {
    renderWithAuthState({
      auth: { token: "store-token", initialized: true },
    });

    expect(screen.getByText("Protected page")).toBeInTheDocument();
  });

  it("redirects to login when there is no token", () => {
    renderWithAuthState({
      auth: { token: null, initialized: true },
    });

    expect(screen.getByText("Login page")).toBeInTheDocument();
  });

  it("renders nothing until auth initialization completes", () => {
    renderWithAuthState({
      auth: { token: null, initialized: false },
    });

    expect(screen.queryByText("Protected page")).not.toBeInTheDocument();
    expect(screen.queryByText("Login page")).not.toBeInTheDocument();
  });
});
