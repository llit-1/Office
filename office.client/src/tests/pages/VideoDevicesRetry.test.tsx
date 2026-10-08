import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import VideoDevices from "../../Pages/VideoDevices/VideoDevices";
import pageTitle from "../../Store/stateForPageTitleSlice";
import backButton from "../../Store/stateForBackButtonSlice";
const { notifications } = vi.hoisted(() => ({
  notifications: { show: vi.fn() },
}));
vi.mock("@toolpad/core", () => ({ useNotifications: () => notifications }));
const devices = ["online", "offline", "ping", "offline"].map(
  (status, index) => ({
    guid: String(index),
    ip: `10.0.0.${index}`,
    locationName: `Точка ${index}`,
    isTestLocation: index === 3,
    videoList: "[]",
    version: "1",
    status,
  }),
);
vi.mock("../../Services/api", () => ({
  get: async () => ({ devices, serverVersion: "1", usedVideoNames: [] }),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  getApiBaseUrl: () => "/api",
  getAccessToken: () => null,
  callApi: async (p: Promise<unknown>) => ({ ok: true, data: await p }),
}));
function response(rows: Array<{ guid: string; status: string }>) {
  const bytes = new TextEncoder().encode(
    rows
      .map((row) => JSON.stringify({ ...row, ok: row.status === "online" }))
      .join("\n") + "\n",
  );
  let sent = false;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true };
          sent = true;
          return { done: false, value: bytes };
        },
      }),
    },
  };
}
const fetchMock = vi.fn();
beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset().mockResolvedValueOnce(response(devices));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
async function mount() {
  const store = configureStore({ reducer: { pageTitle, backButton } });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <VideoDevices />
      </MemoryRouter>
    </Provider>,
  );
  const button = await screen.findByRole("button", {
    name: "Повторно проверить устройства с ошибками",
  });
  await waitFor(() => expect(button).toBeEnabled());
  return button;
}
it("rechecks only red and yellow devices counted by the errors card and blocks duplicate clicks", async () => {
  let finish!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const button = await mount();
  fireEvent.click(button);
  fireEvent.click(button);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).devices).toEqual([
    { guid: "1", ip: "10.0.0.1" },
    { guid: "2", ip: "10.0.0.2" },
  ]);
  expect(button).toBeDisabled();
  expect(button).toHaveAttribute("aria-busy", "true");
  await act(async () =>
    finish(
      response([
        { guid: "1", status: "online" },
        { guid: "2", status: "online" },
      ]),
    ),
  );
  await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
  expect(button).toBeDisabled();
  expect(screen.getByText("Ошибки").parentElement).toHaveTextContent("0");
});
it("allows retry after an interrupted stream and clears pending check states", async () => {
  fetchMock.mockResolvedValueOnce(response([{ guid: "1", status: "online" }]));
  const button = await mount();
  fireEvent.click(button);
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.getByText("Ошибки").parentElement).toHaveTextContent("1");
  fetchMock.mockResolvedValueOnce(response([{ guid: "2", status: "online" }]));
  fireEvent.click(button);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  expect(JSON.parse(fetchMock.mock.calls[2][1].body).devices).toEqual([
    { guid: "2", ip: "10.0.0.2" },
  ]);
});
