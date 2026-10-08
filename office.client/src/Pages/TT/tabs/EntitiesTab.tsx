import { useCallback, useEffect, useMemo, useState } from "react";
import GenericTable, { type Column } from "../../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../../Components/GenericTable/searchUtils";
import useDebouncedValue from "../../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../../Hooks/usePersistedSearchText";
import { callApi, get } from "../../../Services/api";
import EntityEditModal from "../components/EntityEditModal";
import type { EntityListItem } from "../ttModels";

const tableStateKey = "tt-entity-list";

const ownerLabel = (owner: number) => (owner === 1 ? "Принадлежит" : "Не принадлежит");

const columns: Column<EntityListItem>[] = [
  { key: "name", label: "Организация", responsivePriority: 0 },
  { key: "locationsCount", label: "Кол-во точек", responsivePriority: 2 },
  {
    label: "Принадлежность к ЛЛ",
    responsivePriority: 1,
    sortValue: (row) => row.owner,
    filterValue: (row) => ownerLabel(row.owner),
    render: (row) => ownerLabel(row.owner),
  },
];

export default function EntitiesTab() {
  const [searchText, setSearchText] = usePersistedSearchText(tableStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EntityListItem[]>([]);
  // undefined — окно закрыто, null — создание новой организации.
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const result = await callApi(get<EntityListItem[]>("/TT/entities"));

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
    () => items.filter((item) => includesNormalized(`${item.name ?? ""} ${ownerLabel(item.owner)}`, debouncedSearchText)),
    [debouncedSearchText, items],
  );

  const handleSaved = useCallback(() => {
    setEditingId(undefined);
    setReloadKey((key) => key + 1);
  }, []);

  return (
    <>
      <GenericTable<EntityListItem>
        data={filteredItems}
        columns={columns}
        loading={loading}
        addOption
        onAddClick={() => setEditingId(null)}
        onRowClick={(row) => setEditingId(row.id)}
        tableStateKey={tableStateKey}
        searchPlaceholder="Поиск"
        searchText={searchText}
        onSearchTextChange={setSearchText}
        highlightQuery={debouncedSearchText}
      />
      <EntityEditModal
        isOpen={editingId !== undefined}
        entityId={editingId ?? null}
        onClose={() => setEditingId(undefined)}
        onSaved={handleSaved}
      />
    </>
  );
}
