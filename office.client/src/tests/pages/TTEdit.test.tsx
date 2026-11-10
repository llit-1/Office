import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TTEdit from "../../Pages/TT/TTEdit";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
const show = vi.hoisted(() => vi.fn());
vi.mock("@toolpad/core", () => ({ useNotifications: () => ({ show }) }));
vi.mock("../../Services/api", () => ({
  get: api.get,
  put: api.put,
  post: api.post,
  callApi: (result: unknown) => result,
  getFriendlyErrorMessage: () => "Ошибка соединения",
}));
const model = {
  locationGuid: "point",
  versionGuid: "version",
  name: "Пекарня на Лесной",
  address: "Лесная, 1",
  rkCode: 10,
  aggregatorsCode: 20,
  obd: 30,
  latitude: 55.75,
  longitude: 37.61,
  phone: "9123456789",
  actual: 1,
  delivery: 0,
  versionStartDate: "2020-01-02T00:00:00",
  versionEndDate: null,
  locationTypeGuid: "type",
  locationTypes: [{ guid: "type", name: "Пекарня" }],
  altName: null,
  entities: [
    { guid: "entity", name: "ООО Хлеб" },
    { guid: "other", name: "ООО Ромашка" },
  ],
  requisites: [
    { id: 2, obd: 30, entityGuid: "entity", entityName: "ООО Хлеб", begin: "2024-03-01T00:00:00", end: null },
    { id: 1, obd: 29, entityGuid: "other", entityName: "ООО Ромашка", begin: "2020-01-01T00:00:00", end: "2024-03-01T00:00:00" },
  ],
};
function mount(path = "/TT/Edit/point") {
  return render(
    <Provider store={configureStore({ reducer: { backButton, pageTitle } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/TT/Edit/:id" element={<TTEdit />} />
          <Route path="/TT" element={<div>Список точек</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ ok: true, data: model });
  api.put.mockResolvedValue({ ok: true });
});
describe("TT editing", () => {
  it("показывает, кого не удалось перевести в другую группу NX", async () => {
    api.put.mockResolvedValue({ ok: true, data: { nxWarnings: ["Пользователь «petrov» не найден в NX, изменения применены только на портале."] } });
    mount();
    fireEvent.click(await screen.findByLabelText("Доставка"));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Список точек");
    expect(show).toHaveBeenCalledWith(
      "Пользователь «petrov» не найден в NX, изменения применены только на портале.",
      { severity: "warning", autoHideDuration: 8000 },
    );
  });

  it("loads enabled delivery and saves zero when it is switched off", async () => {
    api.get.mockResolvedValueOnce({
      ok: true,
      data: { ...model, delivery: 1, actual: 0 },
    });
    mount();
    expect(await screen.findByLabelText("Доставка")).toBeChecked();
    expect(screen.getByLabelText("Актуальность")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Доставка"));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Список точек");
    expect(api.put).toHaveBeenCalledWith(
      "/TT/point",
      expect.objectContaining({ delivery: 0, actual: 0 }),
    );
  });
  it("disables the form while saving", async () => {
    let complete!: (value: unknown) => void;
    api.put.mockReturnValueOnce(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    mount();
    await screen.findByLabelText("Телефон");
    fireEvent.change(screen.getByLabelText("Адрес"), {
      target: { value: "Новый адрес" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Телефон")).toBeDisabled(),
    );
    expect(screen.getByLabelText("Доставка")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Отмена" })).toBeDisabled();
    complete({ ok: true });
    await screen.findByText("Список точек");
  });
  it("loads fields and saves normalized coordinates, phone, dates and inactive status", async () => {
    mount();
    expect(await screen.findByLabelText("Телефон")).toHaveValue(
      "912 345-67-89",
    );
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Широта"), {
      target: { value: "-12,345678" },
    });
    fireEvent.change(screen.getByLabelText("Долгота"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Дата открытия"), {
      target: { value: "2021-05-06" },
    });
    fireEvent.click(screen.getByLabelText("Актуальность"));
    expect(screen.getByLabelText("Доставка")).not.toBeChecked();
    fireEvent.click(screen.getByLabelText("Доставка"));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Список точек");
    expect(api.put).toHaveBeenCalledWith(
      "/TT/point",
      expect.objectContaining({
        versionGuid: "version",
        latitude: -12.345678,
        longitude: 0,
        phone: "9123456789",
        actual: 0,
        delivery: 1,
        versionStartDate: "2021-05-06",
      }),
    );
  });
  it("masks typing and accepts pasted Russian phone numbers", async () => {
    const user = userEvent.setup();
    mount();
    const phone = await screen.findByLabelText("Телефон");
    await user.clear(phone);
    await user.type(phone, "9123456789");
    expect(phone).toHaveValue("912 345-67-89");
    fireEvent.change(phone, { target: { value: "+7 (999) 123-45-67" } });
    expect(phone).toHaveValue("999 123-45-67");
  });
  it("blocks invalid coordinates, incomplete phone and reversed dates", async () => {
    mount();
    await screen.findByLabelText("Телефон");
    fireEvent.change(screen.getByLabelText("Широта"), {
      target: { value: "91" },
    });
    fireEvent.change(screen.getByLabelText("Долгота"), {
      target: { value: "oops" },
    });
    fireEvent.change(screen.getByLabelText("Телефон"), {
      target: { value: "912" },
    });
    fireEvent.change(screen.getByLabelText("Дата закрытия"), {
      target: { value: "2019-01-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findAllByRole("alert")).toHaveLength(4);
    expect(api.put).not.toHaveBeenCalled();
  });
  it("clears optional values without converting empty coordinates to zero", async () => {
    mount();
    await screen.findByLabelText("Телефон");
    for (const label of ["Телефон", "Широта", "Долгота", "Дата открытия"])
      fireEvent.change(screen.getByLabelText(label), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Список точек");
    expect(api.put).toHaveBeenCalledWith(
      "/TT/point",
      expect.objectContaining({
        phone: null,
        latitude: null,
        longitude: null,
        versionStartDate: null,
      }),
    );
  });
  it("keeps edits after save failure and allows retry", async () => {
    api.put.mockResolvedValueOnce({ ok: false, error: {} });
    mount();
    await screen.findByLabelText("Телефон");
    fireEvent.change(screen.getByLabelText("Адрес"), {
      target: { value: "Новый адрес" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Ошибка соединения",
    );
    expect(screen.getByLabelText("Адрес")).toHaveValue("Новый адрес");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Список точек");
  });
  it("locks R-Keeper fields and sends a new requisites version with its start date", async () => {
    mount();
    expect(await screen.findByLabelText("Название")).toBeDisabled();
    expect(screen.getByLabelText("Код RK")).toHaveValue("10");
    expect(screen.getByLabelText("Код OBD")).toHaveValue("30");
    expect(screen.getByLabelText("Юридическое лицо")).toHaveValue("ООО Хлеб");
    expect(screen.getByText("с 01.03.2024")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "История: Код OBD" }));
    expect(await screen.findByText("с 01.01.2020 по 01.03.2024")).toBeInTheDocument();
    expect(screen.getByText("ООО Ромашка")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /закрыть/i }));

    fireEvent.change(screen.getByLabelText("Альтернативное название"), { target: { value: "Лесная у парка" } });
    fireEvent.click(screen.getByRole("button", { name: "Сменить: Юридическое лицо" }));
    expect(await screen.findByLabelText("Код OBD *")).toHaveValue("30");
    fireEvent.change(screen.getByLabelText("Действует с *"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    expect(await screen.findByText("Измените код OBD или юридическое лицо")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Код OBD *"), { target: { value: "31" } });
    fireEvent.change(screen.getByLabelText("Действует с *"), { target: { value: "2024-02-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    expect(await screen.findByText("Позже 01.03.2024")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Действует с *"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    await waitFor(() => expect(screen.getByLabelText("Код OBD")).toHaveValue("31"));
    expect(screen.getByLabelText("Юридическое лицо")).toHaveValue("ООО Хлеб");
    expect(screen.getByText("новое с 01.11.2026")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Список точек");
    const payload = api.put.mock.calls[0][1];
    expect(payload).toMatchObject({
      altName: "Лесная у парка",
      newRequisites: { obd: 31, entityGuid: "entity", begin: "2026-11-01" },
    });
    expect(payload).not.toHaveProperty("entityGuid");
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("rkCode");
  });
  it("pulls a renamed point from R-Keeper without marking the form dirty", async () => {
    api.get.mockResolvedValueOnce({ ok: true, data: { ...model, rk7Name: "Пекарня на Лесной, 1", nameOutdated: true } });
    api.post.mockResolvedValueOnce({ ok: true, data: { name: "Пекарня на Лесной, 1", changed: true } });
    mount();
    expect(await screen.findByText("В R-Keeper: Пекарня на Лесной, 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Обновить название из R-Keeper" }));
    await waitFor(() => expect(screen.getByLabelText("Название")).toHaveValue("Пекарня на Лесной, 1"));
    expect(api.post).toHaveBeenCalledWith("/TT/point/sync-name");
    expect(screen.queryByText(/В R-Keeper:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });
  it("enables saving for a requisites change alone and can undo it", async () => {
    mount();
    await screen.findByLabelText("Код OBD");
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Сменить: Код OBD" }));
    fireEvent.change(await screen.findByLabelText("Код OBD *"), { target: { value: "31" } });
    fireEvent.change(screen.getByLabelText("Действует с *"), { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Применить" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Сохранить" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Отменить смену: Код OBD" }));
    expect(screen.getByLabelText("Код OBD")).toHaveValue("30");
    expect(screen.getByRole("button", { name: "Сохранить" })).toBeDisabled();
  });
  it("binds a free NX group and hides groups of other points", async () => {
    api.get.mockImplementation(async (url: string) => ({
      ok: true,
      data: url === "/TT/nx-groups"
        ? [
            { id: "free", name: "Свободная", takenBy: null },
            { id: "busy", name: "Чужая", takenBy: "Невский 96" },
          ]
        : { ...model, nxLayout: null },
    }));
    mount();
    await screen.findByLabelText("Адрес");
    const select = document.querySelector<HTMLSelectElement>('select[name="nxLayout"]')!;
    await waitFor(() => expect(select.querySelector('option[value="free"]')).not.toBeNull());
    expect(api.get).toHaveBeenCalledWith("/TT/nx-groups", { params: { self: "point" } });
    expect(select.querySelector('option[value="busy"]')).toBeNull();

    fireEvent.change(select, { target: { value: "free" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Список точек");
    expect(api.put.mock.calls[0][1]).toMatchObject({ nxLayout: "free" });
  });
  it("keeps the form usable and the NX group untouched when NX is down", async () => {
    api.get.mockImplementation(async (url: string) =>
      url === "/TT/nx-groups" ? { ok: false, error: {} } : { ok: true, data: { ...model, nxLayout: "group" } });
    mount();
    expect(await screen.findByText("NX недоступен, группу сейчас не поменять")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Адрес"), { target: { value: "Новый адрес" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));
    await screen.findByText("Список точек");
    expect(api.put.mock.calls[0][1]).toMatchObject({ nxLayout: "group" });
  });
  it("creates a point from an R-Keeper restaurant with a required OBD", async () => {
    api.get.mockResolvedValueOnce({
      ok: true,
      data: {
        restaurants: [{ rkCode: 1001, code: 1, name: "Пекарня, Невский 96", status: 3 }],
        locationTypes: [{ guid: "type", name: "Пекарня" }],
        entities: [{ guid: "entity", name: "ООО Хлеб" }],
      },
    });
    api.post.mockResolvedValue({ ok: true });
    mount("/TT/Edit/new");
    await screen.findByLabelText("Код OBD *");
    fireEvent.click(screen.getByRole("button", { name: "Создать" }));
    expect(await screen.findByText("Укажите код OBD")).toBeInTheDocument();
    expect(screen.getByText("Выберите юридическое лицо")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });
  it("does not expose an empty editable form after load failure", async () => {
    api.get.mockResolvedValueOnce({ ok: false, error: {} });
    mount();
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Сохранить" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Повторить загрузку" }));
    await waitFor(() =>
      expect(screen.getByLabelText("Телефон")).toHaveValue("912 345-67-89"),
    );
  });
});
