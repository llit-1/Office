import { useEffect, useMemo, useState } from "react";
import GenericTable, { type Column } from "../../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../../Components/GenericTable/searchUtils";
import useDebouncedValue from "../../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../../Hooks/usePersistedSearchText";
import { callApi, get } from "../../../Services/api";
import type { EntityListItem } from "../ttModels";

const tableStateKey = "tt-entity-list";

const columns: Column<EntityListItem>[] = [
  { key: "name", label: "Организация" },
  { key: "owner", label: "Принадлежность к ЛЛ" },
];

export default function EntitiesTab() {
  const [searchText, setSearchText] = usePersistedSearchText(tableStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EntityListItem[]>([]);

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
  }, []);

  const filteredItems = useMemo(
    () => items.filter((item) => includesNormalized(`${item.name ?? ""} ${item.owner ?? ""}`, debouncedSearchText)),
    [debouncedSearchText, items],
  );

  return (
    <GenericTable<EntityListItem>
      data={filteredItems}
      columns={columns}
      loading={loading}
      addOption={false}
      tableStateKey={tableStateKey}
      searchPlaceholder="Поиск"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      highlightQuery={debouncedSearchText}
    />
  );
}
