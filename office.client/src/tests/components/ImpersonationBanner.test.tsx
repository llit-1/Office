import { fireEvent, render, screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ImpersonationBanner from "../../Components/ImpersonationBanner/ImpersonationBanner";
import auth, { login } from "../../Store/authSlice";

const { stopMock } = vi.hoisted(() => ({ stopMock: vi.fn() }));
vi.mock("../../Services/api", () => ({
  stopImpersonation: (...args: unknown[]) => stopMock(...args),
  getFriendlyErrorMessage: (error: Error) => error.message,
}));

function renderBanner(impersonatedBy: string | null) {
  const store = configureStore({ reducer: { auth } });
  store.dispatch(login({ id: 2, token: "token", fullName: "Розница Тест", impersonatedBy }));
  render(
    <Provider store={store}>
      <ImpersonationBanner />
    </Provider>,
  );
}

describe("ImpersonationBanner", () => {
  beforeEach(() => {
    stopMock.mockReset();
  });

  it("is hidden for a regular session", () => {
    renderBanner(null);
    expect(screen.queryByText(/Вы вошли как/)).not.toBeInTheDocument();
  });

  it("names the user and returns the admin to his card", async () => {
    stopMock.mockResolvedValue(undefined);
    renderBanner("Иванов Иван");

    expect(screen.getByText("Вы вошли как Розница Тест")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Вернуться" }));

    expect(stopMock).toHaveBeenCalledWith("/Users/Edit/2");
  });

  it("shows why the return failed", async () => {
    stopMock.mockRejectedValue(new Error("Сервер недоступен"));
    renderBanner("Иванов Иван");

    fireEvent.click(screen.getByRole("button", { name: "Вернуться" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Сервер недоступен");
  });
});
