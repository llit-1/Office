import { useEffect, useMemo, useState } from "react";
import GenericTable, { type Column } from "../../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../../Components/GenericTable/searchUtils";
import useDebouncedValue from "../../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../../Hooks/usePersistedSearchText";
import { callApi, get } from "../../../Services/api";
import NamedItemEditModal from "../components/NamedItemEditModal";
import { createJobTitle, updateJobTitle } from "../ttApi";
import type { JobTitleListItem } from "../ttModels";

const tableStateKey = "tt-jobtitle-list";

const columns: Column<JobTitleListItem>[] = [
  { key: "name", label: "Должность" },
];

export default function JobTitlesTab() {
  const [searchText, setSearchText] = usePersistedSearchText(tableStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<JobTitleListItem[]>([]);
  // undefined — окно закрыто, null — создание новой должности.
  const [editing, setEditing] = useState<JobTitleListItem | null | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const result = await callApi(get<JobTitleListItem[]>("/TT/jobtitles"));

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
    () => items.filter((item) => includesNormalized(`${item.name ?? ""} ${item.sequence ?? ""}`, debouncedSearchText)),
    [debouncedSearchText, items],
  );

  return (
    <>
      <GenericTable<JobTitleListItem>
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
        title={editing ? "Должность" : "Новая должность"}
        label="Название должности"
        requiredMessage="Укажите название должности."
        maxLength={100}
        initialName={editing?.name ?? ""}
        onClose={() => setEditing(undefined)}
        onSave={async (name) => {
          if (editing) await updateJobTitle(editing.id, name);
          else await createJobTitle(name);
          setEditing(undefined);
          setReloadKey((key) => key + 1);
        }}
      />
    </>
  );
}
