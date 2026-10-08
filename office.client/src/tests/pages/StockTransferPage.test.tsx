import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import StockTransferPage from "../../Pages/Stock/StockTransferPage";

const { api, notifications } = vi.hoisted(() => ({
  api: {
    getStockLookups: vi.fn(),
    getStockObjectSummary: vi.fn(),
    sendStockTransfer: vi.fn(),
    createStockHolder: vi.fn(),
    getStockErrorMessage: (_error: unknown, fallback: string) => fallback,
  },
  notifications: { show: vi.fn() },
}));

vi.mock("@toolpad/core", () => ({ useNotifications: () => notifications }));
vi.mock("../../Pages/Stock/stock.api", () => api);

const laptopCode = "ABC".padStart(24, "0");
const monitorCode = "DEF".padStart(24, "0");

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  api.getStockLookups.mockResolvedValue({
    locations: [
      { guid: "tt-1", name: "Тестовая ТТ 1", actual: true },
      { guid: "tt-2", name: "Тестовая ТТ 2", actual: true },
    ],
    holders: [],
    categories: [],
  });
  api.getStockObjectSummary.mockImplementation(async (code: string) => ({
    code,
    name: code === laptopCode ? "Ноутбук" : "Монитор",
    categoryPath: ["Техника", code === laptopCode ? "Ноутбук" : "Монитор"],
    holderName: null,
    holderDetails: null,
    locationName: "Склад",
    active: true,
  }));
  api.sendStockTransfer.mockResolvedValue({ count: 2 });
});

async function chooseLocation(user: ReturnType<typeof userEvent.setup>, name: string) {
  const select = screen.getByRole("button", { name: "Конечная точка" });
  await waitFor(() => expect(select).toBeEnabled());
  await user.click(select);
  // Select дублирует варианты в скрытом нативном <select>, поэтому выбираем в видимом списке.
  await user.click(within(screen.getByRole("listbox")).getByRole("option", { name }));
}

it("keeps the destination chosen for each object when the point changes", async () => {
  const user = userEvent.setup();
  render(<StockTransferPage />);

  await chooseLocation(user, "Тестовая ТТ 1");
  await user.type(screen.getByLabelText("Код объекта"), "abc{Enter}");
  await screen.findByText("Ноутбук");

  await chooseLocation(user, "Тестовая ТТ 2");
  await user.type(screen.getByLabelText("Код объекта"), "def{Enter}");
  await screen.findByText("Монитор");
  expect(screen.getByText("Разные назначения: 2")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Комментарий *"), "Заявка 15");
  await user.click(screen.getByRole("button", { name: "Передать" }));

  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/1 объект — на точку «Тестовая ТТ 1»; 1 объект — на точку «Тестовая ТТ 2»/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Передать" }));

  await waitFor(() => expect(api.sendStockTransfer).toHaveBeenCalledWith({
    locationGuid: null,
    holderId: null,
    comment: "Заявка 15",
    items: [
      { code: monitorCode, locationGuid: "tt-2", holderId: null, comment: null },
      { code: laptopCode, locationGuid: "tt-1", holderId: null, comment: null },
    ],
  }));
});

it("asks for a destination and assigns it to objects added before the choice", async () => {
  const user = userEvent.setup();
  render(<StockTransferPage />);

  await user.type(screen.getByLabelText("Код объекта"), "abc{Enter}");
  await screen.findByText("Ноутбук");
  await user.click(screen.getByRole("button", { name: "Передать" }));
  expect(screen.getByText(/Чтобы передать: укажите, куда передать 1 объект, заполните комментарий/)).toBeInTheDocument();
  expect(screen.getByText("Не указано")).toBeInTheDocument();

  await chooseLocation(user, "Тестовая ТТ 1");

  expect(screen.queryByText("Не указано")).not.toBeInTheDocument();
  expect(api.sendStockTransfer).not.toHaveBeenCalled();
});

it("does not add the same scanned object twice", async () => {
  const user = userEvent.setup();
  render(<StockTransferPage />);

  await user.type(screen.getByLabelText("Код объекта"), "abc{Enter}");
  await screen.findByText("Ноутбук");
  await user.type(screen.getByLabelText("Код объекта"), "000abc{Enter}");

  expect(api.getStockObjectSummary).toHaveBeenCalledTimes(1);
  expect(notifications.show).toHaveBeenCalledWith(expect.stringContaining("уже в списке"), expect.anything());
});
