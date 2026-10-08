import { configureStore } from "@reduxjs/toolkit";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import LocationEdit from "../../Pages/TT/LocationEdit";
import backButton from "../../Store/stateForBackButtonSlice";
import pageTitle from "../../Store/stateForPageTitleSlice";

const { api } = vi.hoisted(() => ({
  api: {
    getLocationLookups: vi.fn(),
    getLocation: vi.fn(),
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    getTTErrorMessage: (_error: unknown, fallback: string) => fallback,
  },
}));

vi.mock("../../Pages/TT/ttApi", () => api);

function mount(path: string) {
  render(
    <Provider store={configureStore({ reducer: { backButton, pageTitle } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/TT/Location/:group/:id?" element={<LocationEdit />} />
          <Route path="/TT" element={<div>Список локаций</div>} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  );
}

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByRole("button", { name: label }));
  // Select дублирует варианты в скрытом нативном <select>, поэтому выбираем в видимом списке.
  await user.click(within(screen.getByRole("listbox")).getByRole("option", { name: option }));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getLocationLookups.mockResolvedValue({
    types: [
      { guid: "factory-type", name: "Завод" },
      { guid: "workshop-type", name: "Цех" },
    ],
    entities: [{ guid: "entity-1", name: "ООО Хлеб" }],
    parents: [{ guid: "factory-1", name: "Хлебозавод №1" }],
  });
  api.createLocation.mockResolvedValue({ locationGuid: "new" });
});

it("creates a workshop that belongs to a factory and returns to the factory tab", async () => {
  const user = userEvent.setup();
  mount("/TT/Location/factory/new");

  const name = await screen.findByLabelText("Название *");
  await user.click(screen.getByRole("button", { name: "Создать" }));
  expect(await screen.findByText("Укажите название")).toBeInTheDocument();
  expect(api.createLocation).not.toHaveBeenCalled();

  await user.type(name, "Цех выпечки");
  await choose(user, "Тип *", "Цех");
  await choose(user, "Юридическое лицо *", "ООО Хлеб");
  await choose(user, "Принадлежит", "Хлебозавод №1");
  await user.click(screen.getByRole("button", { name: "Создать" }));

  await waitFor(() => expect(api.createLocation).toHaveBeenCalledWith("factory", {
    versionGuid: null,
    name: "Цех выпечки",
    locationTypeGuid: "workshop-type",
    entityGuid: "entity-1",
    parentGuid: "factory-1",
    address: null,
    latitude: null,
    longitude: null,
    versionStartDate: null,
    versionEndDate: null,
  }));
  expect(await screen.findByText("Список локаций")).toBeInTheDocument();
  expect(api.getLocation).not.toHaveBeenCalled();
});
