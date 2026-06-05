import { beforeEach, describe, expect, it, vi } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import Header from "../../Header/Header";
import authReducer from "../../Store/authSlice";
import backButtonReducer from "../../Store/stateForBackButtonSlice";
import pageTitleReducer from "../../Store/stateForPageTitleSlice";
import userDataReducer from "../../Store/userDataSlice";
import preferencesReducer from "../../Store/preferencesSlice";

vi.mock("hamburger-react", () => ({
  default: ({
    toggle,
    toggled,
  }: {
    toggle: (value: boolean) => void;
    toggled: boolean;
  }) => (
    <button type="button" onClick={() => toggle(!toggled)}>
      menu
    </button>
  ),
}));

function renderHeader() {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      backButton: backButtonReducer,
      pageTitle: pageTitleReducer,
      userData: userDataReducer,
      preferences: preferencesReducer,
    },
    preloadedState: {
      auth: { id: 1, token: "token", phone: "", code: null },
      backButton: { path: "/Main", visible: false },
      pageTitle: { title: "Р“Р»Р°РІРЅР°СЏ" },
      userData: {
        newNotifications: [],
        activeNotifications: [],
        roles: [],
        loaded: false,
      },
      preferences: { notificationSoundEnabled: true },
    },
  });

  const result = render(
    <Provider store={store}>
      <MemoryRouter>
        <Header isMenuOpen={true} setIsMenuOpen={vi.fn()} />
      </MemoryRouter>
    </Provider>
  );

  return { store, ...result };
}

describe("Header", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("userFullName", "Иванов Иван Иванович");
    localStorage.setItem("userPosition", "Инженер");
    document.documentElement.removeAttribute("data-theme");
  });

  it("toggles theme and saves it to localStorage", () => {
    renderHeader();

    fireEvent.click(document.querySelector('[class*="header_logo"]') as Element);

    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]);

    expect(localStorage.getItem("theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("toggles notification sound in the store", () => {
    const { store } = renderHeader();

    fireEvent.click(document.querySelector('[class*="header_logo"]') as Element);

    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[1]);

    expect(store.getState().preferences.notificationSoundEnabled).toBe(false);
  });

  it("renders persisted user profile in the menu", () => {
    renderHeader();

    fireEvent.click(document.querySelector('[class*="header_logo"]') as Element);

    expect(screen.getByText("Иванов Иван Иванович")).toBeInTheDocument();
    expect(screen.getByText("Инженер")).toBeInTheDocument();
  });
});
