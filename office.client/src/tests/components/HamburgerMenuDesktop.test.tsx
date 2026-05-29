import { describe, expect, it, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import HamburgerMenuDesktop from "../../HamburgerMenuDesktop/HamburgerMenuDesktop";
import userDataReducer from "../../Store/userDataSlice";
import { menuParts } from "../../menuParts/menuParts";
import { getAvailableMenuParts } from "../../App/access";

function LocationDisplay() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderMenu(roles: string[], isMenuOpen = true) {
  const store = configureStore({
    reducer: {
      userData: userDataReducer,
    },
    preloadedState: {
      userData: {
        newNotifications: [],
        activeNotifications: [],
        roles,
        loaded: true,
      },
    },
  });

  const setIsMenuOpen = vi.fn();

  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={["/Main"]}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <HamburgerMenuDesktop
                  isMenuOpen={isMenuOpen}
                  setIsMenuOpen={setIsMenuOpen}
                />
                <LocationDisplay />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </Provider>
  );

  return { setIsMenuOpen };
}

describe("HamburgerMenuDesktop", () => {
  it("renders only sections available to the user's roles", () => {
    renderMenu([]);

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(getAvailableMenuParts(menuParts, []).length);
  });

  it("navigates and closes menu when a section is clicked", () => {
    const { setIsMenuOpen } = renderMenu(["Calculator"]);

    const items = screen.getAllByRole("listitem");
    fireEvent.click(items[1]);

    expect(setIsMenuOpen).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/Calculator/SelectCategory"
    );
  });

  it("sets item title in collapsed state", () => {
    renderMenu(["Calculator"], false);

    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveAttribute("title", menuParts[1].name);
  });
});
