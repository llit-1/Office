import { useEffect, useMemo, useState } from "react";
import GenericTable, { type Column } from "../../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../../Components/GenericTable/searchUtils";
import useDebouncedValue from "../../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../../Hooks/usePersistedSearchText";
import { callApi, get } from "../../../Services/api";
import type { LocationTypeListItem } from "../ttModels";

const tableStateKey = "tt-type-list";

const columns: Column<LocationTypeListItem>[] = [
  { key: "name", label: "Тип" },
];

export default function LocationTypesTab() {
  const [searchText, setSearchText] = usePersistedSearchText(tableStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<LocationTypeListItem[]>([]);

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
  }, []);

  const filteredItems = useMemo(
    () => items.filter((item) => includesNormalized(item.name ?? "", debouncedSearchText)),
    [debouncedSearchText, items],
  );

  return (
    <GenericTable<LocationTypeListItem>
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
