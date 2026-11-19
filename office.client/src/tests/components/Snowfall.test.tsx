import { render } from "@testing-library/react";
import { configureStore, type Store } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { afterEach, describe, expect, it, vi } from "vitest";
import Snowfall from "../../Components/Snowfall/Snowfall";
import preferences, { setSnowEnabled } from "../../Store/preferencesSlice";

function renderWith(store: Store) {
  return render(
    <Provider store={store}>
      <Snowfall />
    </Provider>,
  ).container;
}

function renderSnow(at: Date, choice?: boolean, withPreferences = true) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(at);
  if (!withPreferences) {
    // the login page store has no preferences slice: snow must not break it
    return renderWith(configureStore({ reducer: { other: (state: null = null) => state } }));
  }
  const store = configureStore({ reducer: { preferences } });
  if (choice !== undefined) store.dispatch(setSnowEnabled(choice));
  return renderWith(store);
}

describe("Snowfall", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("snows in season", () => {
    expect(renderSnow(new Date(2026, 11, 20)).querySelector("canvas")).toBeInTheDocument();
  });

  it("does not snow out of season", () => {
    expect(renderSnow(new Date(2026, 5, 1)).querySelector("canvas")).not.toBeInTheDocument();
  });

  it("does not snow for someone who turned it off", () => {
    expect(renderSnow(new Date(2026, 11, 20), false).querySelector("canvas")).not.toBeInTheDocument();
  });

  it("snows on a page whose store has no preferences, like the login page", () => {
    expect(renderSnow(new Date(2026, 11, 20), undefined, false).querySelector("canvas")).toBeInTheDocument();
  });
});
