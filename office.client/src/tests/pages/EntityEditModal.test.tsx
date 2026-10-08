import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import EntityEditModal from "../../Pages/TT/components/EntityEditModal";

const { api } = vi.hoisted(() => ({
  api: {
    getEntity: vi.fn(),
    createEntity: vi.fn(),
    updateEntity: vi.fn(),
    getTTErrorMessage: (error: unknown, fallback: string) =>
      (error as { message?: string } | undefined)?.message ?? fallback,
    isFolderNotEmptyError: (error: unknown) => (error as { code?: string } | undefined)?.code === "folder-not-empty",
  },
}));

vi.mock("../../Pages/TT/ttApi", () => api);

beforeEach(() => {
  vi.clearAllMocks();
  api.getEntity.mockResolvedValue({
    id: "entity-1",
    name: "ООО Ромашка",
    owner: 1,
    folderExists: true,
    folderAvailable: true,
    folderFileCount: 3,
    folderPath: "\\\\server\\docs\\ООО Ромашка",
  });
});

it("asks before deleting an organization folder that still has files", async () => {
  api.updateEntity
    .mockRejectedValueOnce({ code: "folder-not-empty", message: "В папке «ООО Ромашка» есть файлы (3)." })
    .mockResolvedValueOnce(undefined);
  const onSaved = vi.fn();

  render(<EntityEditModal isOpen entityId="entity-1" onClose={vi.fn()} onSaved={onSaved} />);

  const folderToggle = await screen.findByRole("checkbox", { name: "Папка на диске" });
  expect(folderToggle).toBeChecked();
  expect(screen.getByText(/Файлов в папке: 3/)).toBeInTheDocument();

  fireEvent.click(folderToggle);
  fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

  const dialog = await screen.findByRole("dialog", { name: "Удалить папку вместе с файлами?" });
  expect(within(dialog).getByText(/Файлы будут удалены безвозвратно/)).toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();

  fireEvent.click(within(dialog).getByRole("button", { name: "Удалить папку" }));

  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(api.updateEntity).toHaveBeenLastCalledWith("entity-1", {
    name: "ООО Ромашка",
    owner: 1,
    folder: false,
    confirmFolderDeletion: true,
  });
});

it("creates an organization with a folder", async () => {
  api.createEntity.mockResolvedValue({ id: "new" });
  const onSaved = vi.fn();

  render(<EntityEditModal isOpen entityId={null} onClose={vi.fn()} onSaved={onSaved} />);

  fireEvent.click(screen.getByRole("button", { name: "Создать" }));
  expect(await screen.findByText("Укажите название организации.")).toBeInTheDocument();
  expect(api.createEntity).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Название *"), { target: { value: " ООО Василёк " } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Папка на диске" }));
  fireEvent.click(screen.getByRole("button", { name: "Создать" }));

  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(api.createEntity).toHaveBeenCalledWith({ name: "ООО Василёк", owner: 1, folder: true, confirmFolderDeletion: false });
  expect(api.getEntity).not.toHaveBeenCalled();
});
