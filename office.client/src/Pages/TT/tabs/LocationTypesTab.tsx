import { useEffect, useMemo, useState } from "react";
import GenericTable, { type Column } from "../../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../../Components/GenericTable/searchUtils";
import useDebouncedValue from "../../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../../Hooks/usePersistedSearchText";
import { callApi, get } from "../../../Services/api";
import NamedItemEditModal from "../components/NamedItemEditModal";
import { createLocationType, updateLocationType } from "../ttApi";
import type { LocationTypeListItem } from "../ttModels";

const tableStateKey = "tt-type-list";

const columns: Column<LocationTypeListItem>[] = [
  { key: "name", label: "Тип", responsivePriority: 0 },
  { key: "locationsCount", label: "Кол-во локаций", responsivePriority: 1 },
];

export default function LocationTypesTab() {
  const [searchText, setSearchText] = usePersistedSearchText(tableStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LocationTypeListItem[]>([]);
  // undefined — окно закрыто, null — создание нового типа.
  const [editing, setEditing] = useState<LocationTypeListItem | null | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const result = await callApi(get<LocationTypeListItem[]>("/TT/types"));

      if (!cancelled) {
        if (result.ok) {
          setItems(result.data);
        }
        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const filteredItems = useMemo(
    () => items.filter((item) => includesNormalized(item.name ?? "", debouncedSearchText)),
    [debouncedSearchText, items],
  );

  return (
    <>
      <GenericTable<LocationTypeListItem>
        data={filteredItems}
        columns={columns}
        loading={loading}
        addOption
        onAddClick={() => setEditing(null)}
        onRowClick={(row) => setEditing(row)}
        tableStateKey={tableStateKey}
        searchPlaceholder="Поиск"
        searchText={searchText}
        onSearchTextChange={setSearchText}
        highlightQuery={debouncedSearchText}
      />
      <NamedItemEditModal
        isOpen={editing !== undefined}
        isCreate={!editing}
        title={editing ? "Тип" : "Новый тип"}
        label="Название типа"
        requiredMessage="Укажите название типа."
        maxLength={50}
        initialName={editing?.name ?? ""}
        onClose={() => setEditing(undefined)}
        onSave={async (name) => {
          if (editing) await updateLocationType(editing.id, name);
          else await createLocationType(name);
          setEditing(undefined);
          setReloadKey((key) => key + 1);
        }}
      />
    </>
  );
}
