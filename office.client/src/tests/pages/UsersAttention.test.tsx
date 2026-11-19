import { fireEvent, render, screen, within } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Users from "../../Pages/Users/Users";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";
import usersTabs from "../../Store/usersTabsSlice";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("../../Services/api", () => ({
  get: (...args: unknown[]) => getMock(...args),
  callApi: async (promise: Promise<unknown>) => {
    try {
      return { ok: true, data: await promise };
    } catch (error) {
      return { ok: false, error };
    }
  },
}));

const users = [
  { id: 1, login: "LL-Engelsa111", surname: "Розница", name: "Энгельса 111", position: "Собственная пекарня", defaultLocations: 0, locations: [{}], officeGroup: [] },
  { id: 2, login: "ll-chkalovskii23", surname: "Розница", name: "Чкаловский 23", position: "Пекарня", defaultLocations: 0, locations: [{}], officeGroup: [{}] },
  { id: 3, login: "ivanova", surname: "Иванова", name: "Анна", position: "Администратор ТТ", defaultLocations: 1, locations: [], officeGroup: [{}, {}] },
];

const noAttention = { noAccess: [], stale: [] };

function renderUsers(formatIssues: unknown[], attention: unknown = noAttention) {
  getMock.mockImplementation(async (url: string) => {
    if (url === "/User/tradepoint-format") return formatIssues;
    if (url === "/User/attention") return attention;
    return users;
  });
  const store = configureStore({ reducer: { backButton, pageTitle, usersTabs } });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Users />
      </MemoryRouter>
    </Provider>,
  );
}

const visibleNames = () => ["Розница Энгельса 111", "Розница Чкаловский 23", "Иванова Анна"].filter((name) => screen.queryByText(name));

describe("Users: учётки, требующие внимания", () => {
  beforeEach(() => {
    getMock.mockReset();
    localStorage.clear();
  });

  it("marks the row with every reason and filters by the format chip", async () => {
    renderUsers(
      [{ userId: 1, login: "LL-Engelsa111", issues: ["должность «Собственная пекарня» вместо «Пекарня»"] }],
      { ...noAttention, stale: [{ userId: 1, reason: "последний вход 01.06.2026" }] },
    );

    expect(await screen.findByRole("img", {
      name: "Требует внимания: формат учётки точки: должность «Собственная пекарня» вместо «Пекарня»",
    })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Требует внимания: последний вход 01.06.2026" })).toBeInTheDocument();

    // on the users tab the count sits on the chips, not on the tab
    expect(screen.queryByLabelText(/требуют внимания/)).not.toBeInTheDocument();
    const chip = screen.getByRole("button", { name: "Неверный формат ТТ: 1" });
    fireEvent.click(chip);

    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(visibleNames()).toEqual(["Розница Энгельса 111"]);
  });

  it("shows only non-empty chips and keeps one filter at a time", async () => {
    renderUsers([], {
      noAccess: [{ userId: 3, reason: "нет торговых точек" }],
      stale: [{ userId: 2, reason: "последний вход 01.06.2026" }],
    });

    const stale = await screen.findByRole("button", { name: "Не заходили 90 дней: 1" });
    const noAccess = screen.getByRole("button", { name: "Без доступа: 1" });
    expect(screen.queryByRole("button", { name: /Неверный формат ТТ/ })).not.toBeInTheDocument();

    fireEvent.click(stale);
    expect(visibleNames()).toEqual(["Розница Чкаловский 23"]);

    fireEvent.click(noAccess);
    expect(stale).toHaveAttribute("aria-pressed", "false");
    expect(visibleNames()).toEqual(["Иванова Анна"]);

    fireEvent.click(noAccess);
    expect(visibleNames()).toHaveLength(3);
  });

  it("keeps the count of distinct users on the tab while another tab is open", async () => {
    renderUsers(
      [{ userId: 1, login: "LL-Engelsa111", issues: ["отчество должно быть пустым"] }],
      { ...noAttention, stale: [{ userId: 1, reason: "последний вход 01.06.2026" }, { userId: 2, reason: "последний вход 01.06.2026" }] },
    );
    await screen.findByRole("button", { name: "Неверный формат ТТ: 1" });

    // the first «Группы» is the tab, the second one is the column header
    fireEvent.click(screen.getAllByText("Группы")[0]);

    expect(await screen.findByLabelText("требуют внимания: 2")).toHaveTextContent("2");
    expect(screen.queryByRole("button", { name: /Неверный формат ТТ/ })).not.toBeInTheDocument();
  });

  it("shows how many points and groups each user has", async () => {
    renderUsers([]);

    const row = (await screen.findByText("Иванова Анна")).closest("tr")!;
    const cells = within(row).getAllByRole("cell").map((cell) => cell.textContent);
    expect(cells).toContain("Все");
    expect(cells).toContain("2");
    expect(within(screen.getByText("Розница Энгельса 111").closest("tr")!).getAllByRole("cell").map((cell) => cell.textContent))
      .toEqual(expect.arrayContaining(["1", "0"]));
  });

  it("colours a dot per reason like its chip", async () => {
    renderUsers(
      [{ userId: 1, login: "LL-Engelsa111", issues: ["отчество должно быть пустым"] }],
      { noAccess: [{ userId: 1, reason: "нет ни одной группы" }], stale: [] },
    );

    const dots = await screen.findAllByRole("img", { name: /Требует внимания/ });
    expect(dots.map((dot) => dot.getAttribute("data-kind"))).toEqual(["format", "noAccess"]);
    expect(screen.getByRole("button", { name: "Без доступа: 1" })).toHaveAttribute("data-kind", "noAccess");
  });

  it("shows nothing extra when nobody needs attention", async () => {
    renderUsers([]);

    expect(await screen.findByText("Розница Чкаловский 23")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /: \d+$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Требует внимания/ })).not.toBeInTheDocument();
  });
});
