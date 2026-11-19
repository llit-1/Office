import type { ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import useUserDataPolling from "../../Hooks/useUserDataPolling";
import auth, { login } from "../../Store/authSlice";
import preferences from "../../Store/preferencesSlice";
import userData from "../../Store/userDataSlice";

const { postMock, getUserDataMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  getUserDataMock: vi.fn(),
}));
vi.mock("../../Services/api", () => ({
  post: (...args: unknown[]) => postMock(...args),
  accessTokenRolesMatch: () => true,
  getAccessToken: () => "token",
  refreshSession: vi.fn(),
}));
vi.mock("../../Services/userData", () => ({ getUserData: () => getUserDataMock() }));

const fresh = { id: 5, dateTime: "2026-11-18T10:00:00", status: 0 };

function renderPolling(impersonatedBy: string | null) {
  const store = configureStore({ reducer: { auth, preferences, userData } });
  store.dispatch(login({ id: 2, token: "token", fullName: "Розница Тест", impersonatedBy }));
  const beep = vi.fn().mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  renderHook(() => useUserDataPolling(beep), { wrapper });
  return { store, beep };
}

describe("useUserDataPolling: новые уведомления", () => {
  beforeEach(() => {
    postMock.mockReset().mockResolvedValue(undefined);
    getUserDataMock.mockReset().mockImplementation(async () => ({
      newNotifications: [fresh],
      activeNotifications: [],
      roles: ["Calculator"],
    }));
  });

  it("marks them read with a beep for the user himself", async () => {
    const { store, beep } = renderPolling(null);

    await waitFor(() => expect(store.getState().userData.activeNotifications).toHaveLength(1));
    expect(postMock).toHaveBeenCalledWith("/Notification/setnotificationsstatusone", [5]);
    expect(beep).toHaveBeenCalled();
    expect(store.getState().userData.newNotifications).toEqual([]);
  });

  it("leaves them new and silent while an admin is under the account", async () => {
    const { store, beep } = renderPolling("Иванов Иван");

    await waitFor(() => expect(store.getState().userData.newNotifications).toHaveLength(1));
    expect(postMock).not.toHaveBeenCalled();
    expect(beep).not.toHaveBeenCalled();
  });
});
