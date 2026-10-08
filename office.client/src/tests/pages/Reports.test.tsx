import { render, screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import Reports from "../../Pages/Reports/Reports";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";

const { api } = vi.hoisted(() => ({
  api: {
    getReportCatalog: vi.fn(),
    getReportErrorMessage: (_error: unknown, fallback: string) => fallback,
  },
}));

vi.mock("../../Pages/Reports/reports.api", () => api);

function renderReports() {
  const store = configureStore({ reducer: { pageTitle, backButton } });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Reports />
      </MemoryRouter>
    </Provider>,
  );
}

beforeEach(() => {
  api.getReportCatalog.mockReset();
});

it("shows available reports with their state and destinations", async () => {
  api.getReportCatalog.mockResolvedValue({
    canManage: true,
    reports: [
      { code: "profit", title: "Выручка", description: "Power BI", kind: "powerBi", configured: false, url: null },
      { code: "franchisee", title: "Отчёты франчайзи", description: "Excel", kind: "franchisee", configured: true, url: null },
      { code: "1c", title: "Отчёты 1С", description: "1С", kind: "external", configured: true, url: "http://1c.test/" },
    ],
  });

  renderReports();

  const profit = await screen.findByRole("link", { name: /Выручка/ });
  expect(profit).toHaveAttribute("href", "/Reports/View/profit");
  expect(screen.getByText("Не настроен")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Отчёты франчайзи/ })).toHaveAttribute("href", "/Reports/Franchisee");

  const oneC = screen.getByRole("link", { name: /Отчёты 1С/ });
  expect(oneC).toHaveAttribute("href", "http://1c.test/");
  expect(oneC).toHaveAttribute("target", "_blank");
  expect(screen.getByRole("link", { name: /Настройки отчётов/ })).toHaveAttribute("href", "/Reports/Settings");
});

it("explains when no report roles are assigned", async () => {
  api.getReportCatalog.mockResolvedValue({ canManage: false, reports: [] });

  renderReports();

  expect(await screen.findByText("Нет доступных отчётов")).toBeInTheDocument();
});
