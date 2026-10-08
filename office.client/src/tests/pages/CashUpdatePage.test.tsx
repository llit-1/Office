import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CashUpdatePage from "../../Pages/DeliveryMenu/CashUpdatePage";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";
import userData from "../../Store/userDataSlice";
import auth from "../../Store/authSlice";
import type { CashClient, CashTask, CashVersion } from "../../Pages/DeliveryMenu/cash.api";
import { TASK_POLL_MS } from "../../Pages/DeliveryMenu/components/CashClientsSection";

const api = vi.hoisted(() => ({
  getCashLocations: vi.fn(),
  sendCashMessage: vi.fn(),
  getCashVersions: vi.fn(),
  addCashVersion: vi.fn(),
  deleteCashVersion: vi.fn(),
  downloadCashVersion: vi.fn(),
  getCashClients: vi.fn(),
  installOnCashClient: vi.fn(),
  installCashVersion: vi.fn(),
  getCashTasks: vi.fn(),
  deleteCashClient: vi.fn(),
}));
vi.mock("../../Pages/DeliveryMenu/cash.api", () => api);
const show = vi.hoisted(() => vi.fn());
vi.mock("@toolpad/core", () => ({ useNotifications: () => ({ show }) }));

const clients: CashClient[] = [
  { id: 3, name: "Богатырский 54", locationGuid: null, ip: "10.140.31.19", midServer: 15139,
    cashVersion: "1.4.8.0", lastConnection: "2026-09-15T18:20:00" },
  { id: 4, name: "Чайковского 21", locationGuid: null, ip: "10.140.31.20", midServer: 15140,
    cashVersion: "1.4.6.0", lastConnection: "2026-09-01T09:05:00" },
  { id: 5, name: "Стачек 73", locationGuid: null, ip: null, midServer: null,
    cashVersion: null, lastConnection: null },
];

const versions: CashVersion[] = [
  { id: 7, version: "1.4.8.0", actual: true, createdAt: "2026-09-10T10:00:00", size: 12 * 1024 * 1024 },
  { id: 6, version: "1.4.7.0", actual: false, createdAt: "2026-08-01T10:00:00", size: null },
];

function renderPage() {
  const store = configureStore({
    reducer: { backButton, pageTitle, userData, auth },
    preloadedState: {
      userData: { loaded: true, roles: ["CashUpdate"], activeNotifications: [], newNotifications: [] },
      auth: { token: "test", id: 1, initialized: true, fullName: null, position: null },
    },
  });
  return render(<Provider store={store}><MemoryRouter initialEntries={["/Cash/update"]}><CashUpdatePage /></MemoryRouter></Provider>);
}

function zip(name = "cashclient.zip") {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/zip" });
}

/** Панель появляется только когда версии загружены, поэтому она же служит якорем ожидания. */
const waitForToolbar = () => screen.findByRole("button", { name: "Установить на все кассы" });

/** Модалка ловит фокус, поэтому её поля ищутся отдельно от одноимённых контролов страницы. */
function dialog() {
  return within(screen.getByRole("dialog"));
}

async function openForm(version: string, file?: File) {
  fireEvent.click(screen.getByRole("button", { name: "Добавить версию" }));
  fireEvent.change(await dialog().findByLabelText("Версия"), { target: { value: version } });
  if (!file) return;
  const input = screen.getByRole("dialog").querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

function submitForm() {
  fireEvent.click(dialog().getByRole("button", { name: "Добавить" }));
}

describe("Cash update — versions", () => {
  beforeEach(() => {
    show.mockReset();
    api.getCashVersions.mockReset().mockResolvedValue(versions);
    api.addCashVersion.mockReset().mockResolvedValue(undefined);
    api.deleteCashVersion.mockReset().mockResolvedValue(undefined);
    api.downloadCashVersion.mockReset().mockResolvedValue(new Blob(["zip"]));
    api.getCashClients.mockReset().mockResolvedValue(clients);
    api.installCashVersion.mockReset().mockResolvedValue({ total: 3, queued: 3, failed: [] });
    api.installOnCashClient.mockReset().mockResolvedValue(undefined);
    api.getCashTasks.mockReset().mockResolvedValue([]);
    api.deleteCashClient.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });
  });

  it("preselects the actual version and shows its details", async () => {
    renderPage();
    await waitForToolbar();
    expect(screen.getByRole("combobox")).toHaveValue("7");
  });

  it("does not allow deleting the version the cash registers run on and says why", async () => {
    renderPage();
    await waitForToolbar();
    expect(screen.getByRole("button", { name: "Удалить версию" })).toBeDisabled();
    // Подсказка живёт на обёртке: у выключенной кнопки браузер её не показывает.
    expect(screen.getByRole("button", { name: "Удалить версию" }).parentElement)
      .toHaveAttribute("title", "Версия 1.4.8.0 стоит на кассах — сначала установите другую");
  });

  it("deletes an archived version after confirmation", async () => {
    renderPage();
    await waitForToolbar();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Удалить версию" }));
    fireEvent.click(await within(await screen.findByRole("dialog")).findByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(api.deleteCashVersion).toHaveBeenCalledWith(6));
    expect(api.getCashVersions).toHaveBeenCalledTimes(2);
  });

  it("rejects a malformed version number without calling the API", async () => {
    renderPage();
    await waitForToolbar();
    await openForm("релиз", zip());
    submitForm();
    expect(await dialog().findByRole("alert")).toHaveTextContent("цифрами через точку");
    expect(api.addCashVersion).not.toHaveBeenCalled();
  });

  it("requires an archive before uploading", async () => {
    renderPage();
    await waitForToolbar();
    await openForm("1.4.9.0");
    submitForm();
    expect(await dialog().findByRole("alert")).toHaveTextContent("zip-архив");
    expect(api.addCashVersion).not.toHaveBeenCalled();
  });

  it("refuses a version number that is already uploaded", async () => {
    renderPage();
    await waitForToolbar();
    await openForm("1.4.7.0", zip());
    submitForm();
    expect(await dialog().findByRole("alert")).toHaveTextContent("уже загружена");
    expect(api.addCashVersion).not.toHaveBeenCalled();
  });

  it("uploads the archive and reloads the list", async () => {
    const file = zip();
    renderPage();
    await waitForToolbar();
    await openForm(" 1.4.9.0 ", file);
    submitForm();
    await waitFor(() => expect(api.addCashVersion).toHaveBeenCalledWith("1.4.9.0", file));
    await waitFor(() => expect(api.getCashVersions).toHaveBeenCalledTimes(2));
    expect(show).toHaveBeenCalledWith("Версия 1.4.9.0 загружена.", expect.objectContaining({ severity: "success" }));
  });

  it("keeps the form open with an explanation when the upload fails", async () => {
    api.addCashVersion.mockRejectedValue(new Error("Сервис недоступен"));
    renderPage();
    await waitForToolbar();
    await openForm("1.4.9.0", zip());
    submitForm();
    expect(await dialog().findByRole("alert")).toBeInTheDocument();
    expect(dialog().getByLabelText("Версия")).toHaveValue("1.4.9.0");
    expect(api.getCashVersions).toHaveBeenCalledTimes(1);
  });

  it("leaves only the meaningful action when nothing is uploaded yet", async () => {
    api.getCashVersions.mockResolvedValue([]);
    renderPage();
    // Выбирать, скачивать и раскатывать нечего — в панели остаётся одна кнопка.
    expect(await screen.findByRole("button", { name: "Добавить версию" })).toBeEnabled();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Скачать архив версии" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Удалить версию" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Установить на все кассы" })).not.toBeInTheDocument();
  });

  it("never installs a freshly uploaded version by itself", async () => {
    const file = zip();
    renderPage();
    await waitForToolbar();
    await openForm("1.4.9.0", file);
    submitForm();
    await waitFor(() => expect(api.addCashVersion).toHaveBeenCalledWith("1.4.9.0", file));
    expect(api.installCashVersion).not.toHaveBeenCalled();
  });

  it("asks before rolling the selected version out to every register", async () => {
    renderPage();
    await waitForToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Установить на все кассы" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("до версии 1.4.8.0");
    expect(api.installCashVersion).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Установить" }));
    await waitFor(() => expect(api.installCashVersion).toHaveBeenCalledWith(7));
    await waitFor(() => expect(api.getCashClients).toHaveBeenCalledTimes(2));
  });

  it("installs the selected version, not only the one already on the registers", async () => {
    renderPage();
    await waitForToolbar();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Установить на все кассы" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Установить" }));
    await waitFor(() => expect(api.installCashVersion).toHaveBeenCalledWith(6));
  });

  it("reports a partial rollout instead of claiming success", async () => {
    api.installCashVersion.mockResolvedValue({ total: 3, queued: 2, failed: ["Стачек 73"] });
    renderPage();
    await waitForToolbar();
    fireEvent.click(screen.getByRole("button", { name: "Установить на все кассы" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Установить" }));
    await waitFor(() => expect(show).toHaveBeenCalledWith(
      "Задача поставлена 2 из 3. Не приняли: Стачек 73.",
      expect.objectContaining({ severity: "warning" }),
    ));
  });

  it("supports retrying a failed load", async () => {
    api.getCashVersions.mockRejectedValueOnce(new Error("Ошибка загрузки"));
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Повторить загрузку версий" }));
    await waitForToolbar();
    expect(screen.getByRole("combobox")).toHaveValue("7");
    expect(api.getCashVersions).toHaveBeenCalledTimes(2);
  });

  it("downloads the selected version", async () => {
    const createObjectURL = vi.fn(() => "blob:cash");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    try {
      renderPage();
      await waitForToolbar();
      fireEvent.click(screen.getByRole("button", { name: "Скачать архив версии" }));
      await waitFor(() => expect(api.downloadCashVersion).toHaveBeenCalledWith(7));
      expect(createObjectURL).toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("Cash update — cash register cards", () => {
  beforeEach(() => {
    show.mockReset();
    api.getCashVersions.mockReset().mockResolvedValue(versions);
    api.getCashClients.mockReset().mockResolvedValue(clients);
    api.installOnCashClient.mockReset().mockResolvedValue(undefined);
    api.getCashTasks.mockReset().mockResolvedValue([]);
    api.deleteCashClient.mockReset().mockResolvedValue(undefined);
    localStorage.clear();
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1280 });
  });

  it("shows a card per register with its point, address and version", async () => {
    renderPage();
    expect(await screen.findByText("Богатырский 54")).toBeInTheDocument();
    expect(screen.getByText("10.140.31.19")).toBeInTheDocument();
    expect(screen.getByText("Чайковского 21")).toBeInTheDocument();
    expect(screen.getByText("Стачек 73")).toBeInTheDocument();
  });

  it("marks registers that are not on the version being rolled out", async () => {
    renderPage();
    await screen.findByText("Богатырский 54");
    // 1.4.8.0 стоит на кассах, 1.4.6.0 отстала, третья касса ни разу не выходила на связь.
    expect(screen.getByText("версия неизвестна")).toBeInTheDocument();
    expect(screen.getByTitle("На кассах должна быть 1.4.8.0")).toHaveTextContent("1.4.6.0");
  });

  it("counts registers by state", async () => {
    renderPage();
    await screen.findByText("Богатырский 54");
    const value = (label: string) => screen.getByText(label).parentElement?.textContent;
    expect(value("Всего касс")).toContain("3");
    expect(value("Отстают")).toContain("1");
    expect(value("Без связи")).toContain("1");
    expect(value("В работе")).toContain("0");
  });

  it("resolves the installed version from the version id the service sends", async () => {
    api.getCashClients.mockResolvedValue([{ ...clients[0], cashVersion: null, cashVersionId: 6 }]);
    renderPage();
    expect(await screen.findByTitle("На кассах должна быть 1.4.8.0")).toHaveTextContent("1.4.7.0");
  });

  it("shows the stage a register is on and blocks new tasks for it", async () => {
    // stage — последний удавшийся шаг: распаковка готова, касса настраивает и запускает клиент.
    const task: CashTask = { cashId: 4, id: 30, type: "Update", stage: "Extracting", versionId: 7, updatedAt: null };
    api.getCashTasks.mockResolvedValue([task]);
    renderPage();
    const status = await screen.findByRole("status", { name: "Обновление до 1.4.8.0: Настройка и запуск" });
    expect(status).toHaveTextContent("4 из 6");
    expect(screen.getByRole("button", { name: "Обновить кассу Чайковского 21" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Удалить клиент с кассы Чайковского 21" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Обновить кассу Богатырский 54" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "В работе (1)" })).toBeInTheDocument();
  });

  it("says a task is waiting until the register picks it up", async () => {
    api.getCashTasks.mockResolvedValue([{ cashId: 3, id: 31, type: "Delete", stage: null, versionId: null, updatedAt: null }]);
    renderPage();
    expect(await screen.findByRole("status", { name: "Удаление: Ожидает кассу" })).toBeInTheDocument();
  });

  it("shows a finished task and frees the register for new tasks", async () => {
    api.getCashTasks.mockResolvedValue([{ cashId: 3, id: 32, type: "Update", stage: "Completed", versionId: 7, updatedAt: null }]);
    renderPage();
    expect(await screen.findByRole("status", { name: "Обновление до 1.4.8.0: Обновлено" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Обновить кассу Богатырский 54" })).toBeEnabled();
  });

  it("treats Ending_installer as a finished removal", async () => {
    api.getCashTasks.mockResolvedValue([{ cashId: 3, id: 34, type: "Delete", stage: "Ending_installer", versionId: null, updatedAt: null }]);
    renderPage();
    expect(await screen.findByRole("status", { name: "Удаление: Клиент удалён" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Удалить клиент с кассы Богатырский 54" })).toBeEnabled();
  });

  it("treats the server-side Delete_installer stage as a finished removal", async () => {
    api.getCashTasks.mockResolvedValue([{ cashId: 3, id: 35, type: "Delete", stage: "Delete_installer", versionId: null, updatedAt: null }]);
    renderPage();
    expect(await screen.findByRole("status", { name: "Удаление: Клиент удалён" })).toBeInTheDocument();
  });

  it("names the step a removal is on", async () => {
    api.getCashTasks.mockResolvedValue([{ cashId: 3, id: 33, type: "Delete", stage: "StoppingClient", versionId: null, updatedAt: null }]);
    renderPage();
    expect(await screen.findByRole("status", { name: "Удаление: Удаление файлов" })).toHaveTextContent("1 из 3");
  });

  it("keeps the registers visible when task stages are unavailable", async () => {
    api.getCashTasks.mockRejectedValue(new Error("Сервис недоступен"));
    renderPage();
    expect(await screen.findByText("Богатырский 54")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("removes the client from a register only after confirmation", async () => {
    renderPage();
    await screen.findByText("Богатырский 54");
    fireEvent.click(screen.getByRole("button", { name: "Удалить клиент с кассы Чайковского 21" }));
    const confirm = await screen.findByRole("dialog");
    expect(confirm).toHaveTextContent("Чайковского 21");
    expect(api.deleteCashClient).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(api.deleteCashClient).toHaveBeenCalledWith(4));
    expect(api.installOnCashClient).not.toHaveBeenCalled();
    await waitFor(() => expect(api.getCashClients).toHaveBeenCalledTimes(2));
  });

  it("reports why a register refused the removal", async () => {
    api.deleteCashClient.mockRejectedValue(new Error("Касса не найдена."));
    renderPage();
    await screen.findByText("Богатырский 54");
    fireEvent.click(screen.getByRole("button", { name: "Удалить клиент с кассы Чайковского 21" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Удалить" }));
    await waitFor(() => expect(show).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ severity: "error" })));
  });

  it("shows the result once the service stops returning a finished task", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.getCashTasks
        .mockResolvedValueOnce([{ cashId: 4, id: 5, type: "Update", stage: "Created", versionId: 7, updatedAt: null }])
        .mockResolvedValue([]);
      renderPage();
      expect(await screen.findByRole("status", { name: "Обновление до 1.4.8.0: Ожидает кассу" })).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(TASK_POLL_MS + 100);
      expect(await screen.findByRole("status", { name: "Обновление до 1.4.8.0: Обновлено" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Обновить кассу Чайковского 21" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps polling while a register is working on a task", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.getCashTasks.mockResolvedValue([{ cashId: 4, id: 30, type: "Update", stage: "Downloading", versionId: 7, updatedAt: null }]);
      renderPage();
      await screen.findByRole("status", { name: /Остановка клиента/ });
      const calls = api.getCashClients.mock.calls.length;
      await vi.advanceTimersByTimeAsync(TASK_POLL_MS + 100);
      await waitFor(() => expect(api.getCashClients.mock.calls.length).toBeGreaterThan(calls));
      expect(api.getCashTasks.mock.calls.length).toBeGreaterThan(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not poll when nothing is in progress", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderPage();
      await screen.findByText("Богатырский 54");
      await vi.advanceTimersByTimeAsync(TASK_POLL_MS * 2);
      expect(api.getCashClients).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not claim a version is outdated while the version list is unavailable", async () => {
    api.getCashVersions.mockRejectedValue(new Error("Сервис недоступен"));
    renderPage();
    await screen.findByText("Богатырский 54");
    expect(screen.queryByTitle(/На кассах должна быть/)).not.toBeInTheDocument();
  });

  it("keeps the version actions usable when the register list fails", async () => {
    api.getCashClients.mockRejectedValue(new Error("Сервис недоступен"));
    renderPage();
    expect(await screen.findByText("Список касс недоступен")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Установить на все кассы" })).toBeInTheDocument();
  });

  it("filters registers down to the ones that lag behind", async () => {
    renderPage();
    await screen.findByText("Богатырский 54");
    fireEvent.click(screen.getByRole("button", { name: "Отстают (1)" }));
    expect(screen.getByText("Чайковского 21")).toBeInTheDocument();
    expect(screen.queryByText("Богатырский 54")).not.toBeInTheDocument();
  });

  it("queues an update for a single register from its card", async () => {
    renderPage();
    await screen.findByText("Богатырский 54");
    fireEvent.click(screen.getByRole("button", { name: "Обновить кассу Чайковского 21" }));
    const modal = within(await screen.findByRole("dialog"));
    expect(modal.getByText("Сейчас установлена: 1.4.6.0")).toBeInTheDocument();
    // По умолчанию предлагается версия, выбранная в панели (актуальная).
    expect(api.installOnCashClient).not.toHaveBeenCalled();
    fireEvent.click(modal.getByRole("button", { name: "Обновить" }));
    await waitFor(() => expect(api.installOnCashClient).toHaveBeenCalledWith(4, 7));
    expect(api.installCashVersion).not.toHaveBeenCalled();
    await waitFor(() => expect(api.getCashClients).toHaveBeenCalledTimes(2));
  });

  it("rolls a single register back to an older version", async () => {
    renderPage();
    await screen.findByText("Богатырский 54");
    fireEvent.click(screen.getByRole("button", { name: "Обновить кассу Богатырский 54" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByRole("combobox"), { target: { value: "6" } });
    expect(await within(dialog).findByText(/Откат с 1\.4\.8\.0 на 1\.4\.7\.0/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Откатить" }));
    await waitFor(() => expect(api.installOnCashClient).toHaveBeenCalledWith(3, 6));
    expect(show).toHaveBeenCalledWith(expect.stringContaining("1.4.7.0"), expect.objectContaining({ severity: "success" }));
  });

  it("does not queue anything when the version choice is cancelled", async () => {
    renderPage();
    await screen.findByText("Богатырский 54");
    fireEvent.click(screen.getByRole("button", { name: "Обновить кассу Богатырский 54" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Отмена" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.installOnCashClient).not.toHaveBeenCalled();
  });

  it("shows a dash when the installed version is no longer in the list", async () => {
    api.getCashClients.mockResolvedValue([{ ...clients[0], cashVersion: null, cashVersionId: 99 }]);
    renderPage();
    const version = await screen.findByTitle("Установленной версии больше нет в списке");
    expect(version).toHaveTextContent("—");
    const value = (label: string) => screen.getByText(label).parentElement?.textContent;
    expect(value("Отстают")).toContain("1");
  });

  it("does not show a dash before the version list has loaded", async () => {
    api.getCashVersions.mockReturnValue(new Promise(() => {}));
    api.getCashClients.mockResolvedValue([{ ...clients[0], cashVersion: null, cashVersionId: 7 }]);
    renderPage();
    await screen.findByText("Богатырский 54");
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.getByText("…")).toBeInTheDocument();
  });

  it("reloads the registers on demand", async () => {
    renderPage();
    await screen.findByText("Богатырский 54");
    fireEvent.click(screen.getByRole("button", { name: "Обновить список касс" }));
    await waitFor(() => expect(api.getCashClients).toHaveBeenCalledTimes(2));
  });

  it("shows an empty state when no register has connected yet", async () => {
    api.getCashClients.mockResolvedValue([]);
    renderPage();
    expect(await screen.findByRole("heading", { name: "Касс пока нет" })).toBeInTheDocument();
  });
});
