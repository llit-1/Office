import { useEffect, useMemo, useState } from "react";
import GenericTable, { type Column } from "../../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../../Components/GenericTable/searchUtils";
import useDebouncedValue from "../../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../../Hooks/usePersistedSearchText";
import { callApi, get } from "../../../Services/api";
import type { TTListItem } from "../ttModels";
import { formatDate } from "../ttUtils";

const tableStateKey = "tt-trade-list";

const columns: Column<TTListItem>[] = [
  { key: "name", label: "Наименование", responsivePriority: 0 },
  { key: "type", label: "Тип", responsivePriority: 1 },
  { key: "rkCode", label: "Код RK", responsivePriority: 2 },
  { key: "aggregatorsCode", label: "Код ТТ", responsivePriority: 3 },
  { key: "obd", label: "Код OBD", responsivePriority: 4 },
  { key: "address", label: "Адрес", defaultVisible: true, responsivePriority: 5 },
  {
    label: "Дата открытия",
    sortValue: (row) => row.openDate ?? "",
    filterValue: (row) => formatDate(row.openDate),
    render: (row) => formatDate(row.openDate),
  },
  {
    label: "Дата закрытия",
    sortValue: (row) => row.closeDate ?? "",
    filterValue: (row) => formatDate(row.closeDate),
    render: (row) => formatDate(row.closeDate),
  },
];

export default function TradePointsTab() {
  const [searchText, setSearchText] = usePersistedSearchText(tableStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TTListItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const result = await callApi(get<TTListItem[]>("/TT/list", { params: { group: "trade" } }));

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
    () =>
      items.filter((item) =>
        includesNormalized(
          `${item.name ?? ""} ${item.type ?? ""} ${item.address ?? ""} ${item.rkCode ?? ""} ${item.aggregatorsCode ?? ""} ${item.obd ?? ""}`,
          debouncedSearchText,
        ),
      ),
    [debouncedSearchText, items],
  );

  return (
    <GenericTable<TTListItem>
      data={filteredItems}
      columns={columns}
      loading={loading}
      addOption={false}
      routeTo="/TT/Edit"
      tableStateKey={tableStateKey}
      searchPlaceholder="Поиск"
      searchText={searchText}
      onSearchTextChange={setSearchText}
      highlightQuery={debouncedSearchText}
    />
  );
}
