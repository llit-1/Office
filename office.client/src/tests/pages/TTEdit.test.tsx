import { configureStore } from "@reduxjs/toolkit";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import TTEdit from "../../Pages/TT/TTEdit";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock("../../Services/api", () => ({
  get: api.get,
  put: api.put,
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
};
function mount() {
  return render(
    <Provider store={configureStore({ reducer: { backButton, pageTitle } })}>
      <MemoryRouter initialEntries={["/TT/Edit/point"]}>
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
