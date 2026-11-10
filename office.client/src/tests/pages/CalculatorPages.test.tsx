import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import CalculatorHome from "../../Pages/Calculator/CalculatorHome";
import CalculatorPage from "../../Pages/Calculator/CalculatorPage";
import { planFor } from "../../Pages/Calculator/calculator.plan";
import type { CalculatorItem, CalculatorSheet } from "../../Pages/Calculator/calculator.types";
import calculatorData from "../../Store/calculatorSlice";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";
import userData from "../../Store/userDataSlice";

const { show, api } = vi.hoisted(() => ({
  show: vi.fn(),
  api: {
    calls: [] as { method: string; url: string; body?: unknown; params?: unknown }[],
    sheet: null as unknown,
  },
}));
vi.mock("@toolpad/core", () => ({ useNotifications: () => ({ show }) }));
vi.mock("../../Services/api", async () => ({
  ...(await vi.importActual<typeof import("../../Services/api")>("../../Services/api")),
  get: async (url: string, config?: { params?: unknown }) => {
    api.calls.push({ method: "GET", url, params: config?.params });
    if (url === "/Calculator/locations") return [{ code: 1023253, name: "Невский 96" }];
    return structuredClone(api.sheet);
  },
  post: async (url: string, body?: unknown) => {
    api.calls.push({ method: "POST", url, body });
    if (url.endsWith("/blocks")) return { kind: "soft", canUnlock: true, text: "Заблокировал(а) Тест в 10:05" };
    return { savedAt: "2026-10-16T10:06:00" };
  },
  del: async (url: string, config?: { params?: unknown }) => {
    api.calls.push({ method: "DELETE", url, params: config?.params });
  },
}));

vi.setConfig({ testTimeout: 20_000 });

const item = (patch: Partial<CalculatorItem>): CalculatorItem => ({
  rkCode: 1,
  name: "Круассан",
  defrostMinutes: 30,
  bakingMode: "P1",
  minShowCase: 4,
  bunsPer: null,
  itemCoefficient: 1.15,
  avgRest: 2,
  avgProduction: 0,
  avgNext: 3.5,
  avgSecond: 2.5,
  addThis: 0,
  addNext: 0,
  addSecond: 0,
  addFrom: [],
  block: null,
  last: null,
  ...patch,
});

const croissant = item({ rkCode: 1, name: "Круассан" });
const sheet: CalculatorSheet = {
  slug: "bakery",
  title: "Выпечка",
  ttCode: 1023253,
  ttName: "Невский 96",
  now: "2026-10-16T10:05:00",
  reaction: 2,
  period: "Утро",
  periodFrom: 7,
  periodTo: 11,
  horizonHour: 18,
  thisCoefficient: 1.5,
  nextCoefficient: 1.4,
  secondCoefficient: 1.15,
  items: [
    croissant,
    item({ rkCode: 2, name: "Сосиска в тесте", bakingMode: "P4", defrostMinutes: 60, last: { rest: 2, result: 5, fact: null, at: "2026-10-16T09:50:00" } }),
    item({ rkCode: 3, name: "Слойка с мясом", block: { kind: "soft", canUnlock: true, text: "Заблокировал(а) Розница Невский 96 в 6:40" } }),
    item({ rkCode: 4, name: "Хачапури", block: { kind: "hard", canUnlock: false, text: "Аудитор снял с продажи до 20 октября" } }),
  ],
};

function renderCalculator(path: string) {
  const store = configureStore({
    reducer: { calculatorData, pageTitle, backButton, userData },
    preloadedState: { userData: { newNotifications: [], activeNotifications: [], roles: ["Calculator"], loaded: true } },
  });
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/Calculator" element={<CalculatorHome />} />
          <Route path="/Calculator/:category" element={<CalculatorPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

const saveStatus = () => within(screen.getByRole("complementary", { name: "Итог" })).getByRole("status");
const posts = (suffix: string) => api.calls.filter((call) => call.method === "POST" && call.url.endsWith(suffix));
const confirm = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(text)).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Да" }));
};
const LOCK = "Вы уверены, что хотите заблокировать данную позицию?";
const UNLOCK = "Вы уверены, что хотите разблокировать данную позицию?";

beforeEach(() => {
  api.calls = [];
  api.sheet = sheet;
  show.mockReset();
});

it("главная: все категории открыты в любое время", async () => {
  const user = userEvent.setup();
  const store = renderCalculator("/Calculator");

  expect(await screen.findByRole("heading", { name: "Невский 96" })).toBeInTheDocument();
  for (const title of ["Хлеб", "Выпечка", "Кондитерские изделия", "Сэндвичи", "Прочий ассортимент"]) {
    expect(screen.getByRole("link", { name: title })).toBeInTheDocument();
  }
  expect(screen.queryByRole("link", { name: "Настройки калькулятора" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Хлеб" }).querySelector("img")).toHaveAttribute("src", "/img/breads.svg");
  expect(screen.getByRole("link", { name: "Выпечка" }).querySelector("img")).toHaveAttribute("src", "/img/bread.svg");
  expect(screen.getByRole("link", { name: "Кондитерские изделия" }).querySelector("img")).toHaveAttribute("src", "/img/cake.svg");
  expect(screen.getByRole("link", { name: "Сэндвичи" }).querySelector("img")).toHaveAttribute("src", "/img/sandwich.svg");
  expect(screen.getByRole("link", { name: "Прочий ассортимент" }).querySelector("img")).toHaveAttribute("src", "/img/other-food.png");
  // точка запомнилась для следующих заходов
  await waitFor(() => expect(store.getState().calculatorData.ttCode).toBe(1023253));

  await user.click(screen.getByRole("link", { name: "Выпечка" }));
  expect(await screen.findByRole("textbox", { name: "Осталось: Круассан" })).toBeEnabled();
});

it("печать показывает актуальный расчёт отдельным листом и закрывается после печати", async () => {
  const user = userEvent.setup();
  const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
  renderCalculator("/Calculator/bakery");

  await user.type(await screen.findByRole("textbox", { name: "Осталось: Круассан" }), "3");
  await user.click(screen.getByRole("button", { name: "Печать" }));

  await waitFor(() => expect(print).toHaveBeenCalledOnce());
  const printSheet = document.getElementById("calculator-print-sheet");
  expect(printSheet).not.toBeNull();
  expect(printSheet).toHaveTextContent("Выпечка");
  expect(printSheet).toHaveTextContent("Невский 96");
  expect(printSheet?.querySelectorAll("[data-print-row]")).toHaveLength(sheet.items.length);
  const croissantRow = Array.from(printSheet!.querySelectorAll("[data-print-row]")).find((row) => row.textContent?.includes("Круассан"));
  expect(croissantRow?.querySelector('[data-print-value="rest"]')).toHaveTextContent("3");
  expect(croissantRow?.querySelector('[data-print-value="plan"]')).toHaveTextContent(String(planFor(croissant, sheet, 3)));

  act(() => window.dispatchEvent(new Event("afterprint")));
  await waitFor(() => expect(document.getElementById("calculator-print-sheet")).toBeNull());
  print.mockRestore();
});

it("все позиции остаются на одном экране без пагинации", async () => {
  const user = userEvent.setup();
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  const rect = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const result = originalRect.call(this);
    if (this.tagName === "DIV" && this.querySelector('section[aria-label="Позиции"]')) {
      const height = (220 + this.querySelectorAll("[data-calculator-row]").length * 180) * Number(this.style.zoom || 1);
      return { ...result, top: 100, bottom: 100 + height, height } as DOMRect;
    }
    return result;
  });

  try {
    api.sheet = { ...sheet, items: [...sheet.items, item({ rkCode: 5, name: "Булочка" })] };
    renderCalculator("/Calculator/bakery");
    expect(await screen.findByRole("textbox", { name: "Осталось: Круассан" })).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /^Осталось:/ })).toHaveLength(5);
    expect(screen.getByRole("textbox", { name: "Осталось: Слойка с мясом" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Осталось: Булочка" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Страницы позиций" })).not.toBeInTheDocument();
    const page = screen.getByRole("region", { name: "Позиции" }).parentElement as HTMLElement;
    expect(Number(page.style.zoom)).toBeLessThan(1);

    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await user.click(screen.getByRole("button", { name: "Печать" }));
    await waitFor(() => expect(print).toHaveBeenCalledOnce());
    expect(document.querySelectorAll("#calculator-print-sheet [data-print-row]")).toHaveLength(5);
    act(() => window.dispatchEvent(new Event("afterprint")));
    print.mockRestore();
  } finally {
    rect.mockRestore();
  }
});

it("введённое за полчаса видно сразу, как сохранили; новый ввод сохраняется сам", async () => {
  const user = userEvent.setup();
  renderCalculator("/Calculator/bakery");

  // из лога: остаток 2, план 5 — без пересчёта
  const sausage = await screen.findByRole("textbox", { name: "Осталось: Сосиска в тесте" });
  expect(sausage).toHaveValue("2");
  expect(screen.getByLabelText("План: Сосиска в тесте")).toHaveTextContent("5");
  expect(saveStatus()).toHaveTextContent("Сохранено в 09:50");

  await user.type(screen.getByRole("textbox", { name: "Осталось: Круассан" }), "3");
  const plan = planFor(croissant, sheet, 3);
  expect(screen.getByLabelText("План: Круассан")).toHaveTextContent(String(plan));

  await waitFor(() => expect(posts("/entries")).toHaveLength(1), { timeout: 3000 });
  expect(posts("/entries")[0].body).toEqual({ tt: 1023253, rkCode: 1, rest: 3, result: plan, fact: null });
  await waitFor(() => expect(saveStatus()).toHaveTextContent("Сохранено в 10:06"));

  await user.type(screen.getByRole("textbox", { name: /^Факт: Круассан/ }), "2");
  await waitFor(() => expect(posts("/entries")).toHaveLength(2), { timeout: 3000 });
  expect(posts("/entries")[1].body).toMatchObject({ rest: 3, result: plan, fact: 2 });
  const summary = screen.getByRole("complementary", { name: "Итог" });
  expect(within(summary).getByText("Введено").nextSibling).toHaveTextContent("2 из 2"); // две позиции заблокированы и в итог не входят
});

it("ввод, не дождавшийся паузы, отправляется при уходе со страницы", async () => {
  const user = userEvent.setup();
  renderCalculator("/Calculator/bakery");

  await user.type(await screen.findByRole("textbox", { name: "Осталось: Круассан" }), "3");
  cleanup();

  await waitFor(() => expect(posts("/entries")).toHaveLength(1));
  expect(posts("/entries")[0].body).toEqual({ tt: 1023253, rkCode: 1, rest: 3, result: planFor(croissant, sheet, 3), fact: null });
});

it("стёртый остаток не оставляет статус «Сохраняем…»", async () => {
  const user = userEvent.setup();
  renderCalculator("/Calculator/bakery");

  const rest = await screen.findByRole("textbox", { name: "Осталось: Круассан" });
  await user.type(rest, "3");
  await waitFor(() => expect(saveStatus()).toHaveTextContent("Сохранено в 10:06"), { timeout: 3000 });

  await user.clear(rest);

  expect(saveStatus()).toHaveTextContent("Сохраняем…");
  await waitFor(() => expect(saveStatus()).toHaveTextContent("Сохранено в 10:06"), { timeout: 3000 });
  expect(posts("/entries")).toHaveLength(1);
});

it("после блокировки план соседней позиции учитывает перешедший спрос, а ввод не теряется", async () => {
  const user = userEvent.setup();
  renderCalculator("/Calculator/bakery");

  await user.type(await screen.findByRole("textbox", { name: "Осталось: Круассан" }), "3");
  await waitFor(() => expect(posts("/entries")).toHaveLength(1), { timeout: 3000 });

  const moved = { ...croissant, addNext: 10 };
  api.sheet = { ...sheet, items: sheet.items.map((x) => (x.rkCode === 1 ? moved : x)) };
  await user.click(screen.getByRole("button", { name: "Не печём сегодня: Сосиска в тесте" }));
  await confirm(user, LOCK);

  await waitFor(() => expect(screen.getByLabelText("План: Круассан")).toHaveTextContent(String(planFor(moved, sheet, 3))));
  expect(screen.getByRole("textbox", { name: "Осталось: Круассан" })).toHaveValue("3");
  expect(screen.getByRole("textbox", { name: "Осталось: Сосиска в тесте" })).toBeDisabled();
});

it("сохранённый план соседней позиции пересчитывается и записывается заново после блокировки", async () => {
  const user = userEvent.setup();
  renderCalculator("/Calculator/bakery");

  const sausage = sheet.items[1];
  const moved = { ...sausage, addNext: 10 };
  expect(await screen.findByLabelText("План: Сосиска в тесте")).toHaveTextContent("5");

  api.sheet = { ...sheet, items: sheet.items.map((x) => (x.rkCode === 2 ? moved : x)) };
  await user.click(screen.getByRole("button", { name: "Не печём сегодня: Круассан" }));
  await confirm(user, LOCK);

  const plan = planFor(moved, sheet, 2);
  await waitFor(() => expect(screen.getByLabelText("План: Сосиска в тесте")).toHaveTextContent(String(plan)));
  await waitFor(() => expect(posts("/entries")).toHaveLength(1), { timeout: 3000 });
  expect(posts("/entries")[0].body).toMatchObject({ rkCode: 2, rest: 2, result: plan });
});

it("любое значение сохраняется сразу, без проверки", async () => {
  const user = userEvent.setup();
  renderCalculator("/Calculator/bakery");

  await user.type(await screen.findByRole("textbox", { name: "Осталось: Круассан" }), "100");

  await waitFor(() => expect(posts("/entries")).toHaveLength(1), { timeout: 3000 });
  expect(posts("/entries")[0].body).toMatchObject({ rest: 100 });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("без подтверждения блокировка не уходит на сервер", async () => {
  const user = userEvent.setup();
  renderCalculator("/Calculator/bakery");

  await user.click(await screen.findByRole("button", { name: "Не печём сегодня: Круассан" }));
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "Нет" }));

  expect(posts("/blocks")).toHaveLength(0);
  expect(screen.getByRole("textbox", { name: "Осталось: Круассан" })).toBeEnabled();
});

it("введённый остаток уходит в журнал вместе с блокировкой", async () => {
  const user = userEvent.setup();
  renderCalculator("/Calculator/bakery");

  await user.type(await screen.findByRole("textbox", { name: "Осталось: Круассан" }), "3");
  await user.click(screen.getByRole("button", { name: "Не печём сегодня: Круассан" }));
  await confirm(user, LOCK);

  await waitFor(() => expect(posts("/blocks")).toHaveLength(1));
  expect(posts("/blocks")[0].body).toEqual({ tt: 1023253, rkCode: 1, rest: 3 });
});

it("заблокированная позиция остаётся на месте, но не заполняется; свою можно вернуть, аудитора — нет", async () => {
  const user = userEvent.setup();
  renderCalculator("/Calculator/bakery");

  await user.click(await screen.findByRole("button", { name: "Не печём сегодня: Круассан" }));
  await confirm(user, LOCK);
  await waitFor(() => expect(posts("/blocks")).toHaveLength(1));
  expect(posts("/blocks")[0].body).toEqual({ tt: 1023253, rkCode: 1, rest: 0 });
  expect(screen.getByRole("textbox", { name: "Осталось: Круассан" })).toBeDisabled();

  // аудитора — только значок, без кнопки
  expect(screen.getByRole("textbox", { name: "Осталось: Хачапури" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Вернуть: Хачапури" })).not.toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Заблокировано: Аудитор снял с продажи до 20 октября" })).toBeInTheDocument();

  await user.click(await screen.findByRole("button", { name: "Вернуть: Круассан" }));
  await confirm(user, UNLOCK);
  await waitFor(() => expect(api.calls.some((call) => call.method === "DELETE")).toBe(true));
  expect(api.calls.find((call) => call.method === "DELETE")?.params).toEqual({ tt: 1023253, rkCode: 1 });
  expect(screen.getByRole("textbox", { name: "Осталось: Круассан" })).toBeEnabled();
});
