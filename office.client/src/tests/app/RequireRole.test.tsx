import { describe, expect, it } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import RequireRole from "../../App/RequireRole";

function renderWithRoles(roles: string[]) {
  const preloadedState = {
    auth: { token: "token", initialized: true },
    userData: { roles, loaded: true },
  };

  const store = configureStore({
    reducer: () => preloadedState,
    preloadedState,
  });

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route
            path="/protected"
            element={
              <RequireRole requiredRole="Calculator">
                <div>Calculator page</div>
              </RequireRole>
            }
          />
          <Route path="/Main" element={<div>Main page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

function renderWithAllowedRoles(roles: string[]) {
  const preloadedState = {
    auth: { token: "token", initialized: true },
    userData: { roles, loaded: true },
  };

  const store = configureStore({
    reducer: () => preloadedState,
    preloadedState,
  });

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/protected"]}>
        <Routes>
          <Route
            path="/protected"
            element={
              <RequireRole requiredRole={["OrdersTT", "OrdersTTAdmin"]}>
                <div>Orders page</div>
              </RequireRole>
            }
          />
          <Route path="/Main" element={<div>Main page</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

describe("RequireRole", () => {
  it("renders children when the user has the required role", () => {
    renderWithRoles(["Calculator"]);

    expect(screen.getByText("Calculator page")).toBeInTheDocument();
  });

  it("redirects to main when the user does not have the required role", () => {
    renderWithRoles(["Admin"]);

    expect(screen.getByText("Main page")).toBeInTheDocument();
  });

  it("renders children when the user has one of the allowed roles", () => {
    renderWithAllowedRoles(["OrdersTTAdmin"]);

    expect(screen.getByText("Orders page")).toBeInTheDocument();
  });
});
