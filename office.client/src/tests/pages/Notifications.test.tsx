import { describe, expect, it, vi, beforeEach } from "vitest";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Notifications from "../../Pages/Notifications/Notifications";
import authReducer from "../../Store/authSlice";
import backButtonReducer from "../../Store/stateForBackButtonSlice";
import pageTitleReducer from "../../Store/stateForPageTitleSlice";
import userDataReducer from "../../Store/userDataSlice";
import preferencesReducer from "../../Store/preferencesSlice";

const navigateMock = vi.fn();
const showMock = vi.fn();
const callApiMock = vi.fn();
const postMock = vi.fn();
const getMock = vi.fn();
const notificationsApi = { show: showMock };

vi.mock("@toolpad/core", () => ({
  useNotifications: () => notificationsApi,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );

  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock("../../Services/api", () => ({
  callApi: (...args: unknown[]) => callApiMock(...args),
  get: (...args: unknown[]) => getMock(...args),
  post: (...args: unknown[]) => postMock(...args),
}));

function renderNotifications() {
  const store = configureStore({
    reducer: {
      auth: authReducer,
      backButton: backButtonReducer,
      pageTitle: pageTitleReducer,
      userData: userDataReducer,
      preferences: preferencesReducer,
    },
    preloadedState: {
      auth: { id: 3, token: "token", fullName: "Иванов Иван", position: "Инженер", initialized: true },
      backButton: { path: "/Main", visible: false },
      pageTitle: { title: "" },
      userData: {
        newNotifications: [],
        activeNotifications: [
          {
            id: 15,
            dateTime: "2026-06-02T09:00:00",
            typeId: 1,
            officeNotificationType: { id: 1, name: "Запрос доступа" },
            officeUserId: 3,
            relatedEntity: 101,
            status: 1,
            relatedEntityData: {
              id: 10,
              officeUserId: 77,
              dateTime: "2026-06-02T08:00:00",
              status: 0,
              comment: null,
              officeUser: {
                id: 77,
                login: "user77",
                name: "Ivan",
                surname: "Ivanov",
                patronymic: null,
                position: "Manager",
              },
            },
          },
        ],
        roles: [],
        loaded: true,
      },
      preferences: {
        notificationSoundEnabled: true,
        sensorChartExpanded: false,
        sensorChartLineWidth: 3,
      },
    },
  });

  render(
    <Provider store={store}>
      <MemoryRouter>
        <Notifications />
      </MemoryRouter>
    </Provider>,
  );

  return store;
}

describe("Notifications page", () => {
  beforeEach(() => {
    navigateMock.mockReset();
    showMock.mockReset();
    callApiMock.mockReset();
    postMock.mockReset();
    getMock.mockReset();
    getMock.mockResolvedValue([]);
    callApiMock.mockResolvedValue({ ok: true, data: [] });
  });

  it('acknowledges notification before navigating by "Перейти"', async () => {
    postMock.mockResolvedValue(undefined);
    callApiMock
      .mockResolvedValueOnce({ ok: true, data: [] })
      .mockResolvedValueOnce({ ok: true, data: undefined });

    const store = renderNotifications();

    fireEvent.click(screen.getByRole("button", { name: /перейти/i }));

    await waitFor(() => {
      expect(postMock).toHaveBeenCalledWith(
        "/Notification/setnotificationsstatustwo",
        15,
      );
      expect(navigateMock).toHaveBeenCalledWith("/Users/Edit/77");
    });

    expect(store.getState().userData.activeNotifications).toHaveLength(0);
  });
});
