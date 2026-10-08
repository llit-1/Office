import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import GenericTable, { type Column } from "../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../Components/GenericTable/searchUtils";
import Select from "../../Components/Select/Select";
import useDebouncedValue from "../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../Hooks/usePersistedSearchText";
import { callApi } from "../../Services/api";
import { getSkud, type SkudController, type SkudData, type SkudGroup, type SkudReader } from "./skudApi";
import { SkudControllerModal, SkudGroupModal, SkudReaderModal } from "./SkudModals";
import styles from "./FactoryStructure.module.css";

type Section = "groups" | "readers" | "controllers";

const sections: { key: Section; title: string }[] = [
  { key: "groups", title: "Группы" },
  { key: "readers", title: "Считыватели" },
  { key: "controllers", title: "Контроллеры" },
];

const SECTION_PARAM = "skud";
const searchStateKey = "factory-skud-list";

/** Раздел СКУД хранится в ?skud=, чтобы выбор работал из строки вкладок и переживал перезагрузку. */
function useSection() {
  const [searchParams, setSearchParams] = useSearchParams();
  const section = sections.find((item) => item.key === searchParams.get(SECTION_PARAM))?.key ?? "groups";

  const select = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(SECTION_PARAM, key);
    setSearchParams(next, { replace: true });
  };

  return [section, select] as const;
}

/** Выбор раздела СКУД; стоит в строке вкладок страницы, чтобы не отнимать высоту у таблицы. */
export function FactorySkudPicker() {
  const [section, select] = useSection();

  return (
    <div className={styles.dictionaryPicker}>
      <Select
        label="Раздел СКУД"
        hideLabel
        wrapperClassName={styles.pickerField}
        options={sections.map((item) => ({ value: item.key, label: item.title }))}
        value={section}
        onChange={(event) => select(event.target.value)}
      />
    </div>
  );
}

const emptyData: SkudData = { controllers: [], readers: [], groups: [] };

type ReaderRow = SkudReader & { controllerName: string };

export default function FactorySkudTab() {
  const [section] = useSection();
  const [searchText, setSearchText] = usePersistedSearchText(searchStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<SkudData>(emptyData);
  const [reloadKey, setReloadKey] = useState(0);

  // undefined — окно закрыто, null — создание.
  const [editingGroup, setEditingGroup] = useState<SkudGroup | null | undefined>(undefined);
  const [editingReader, setEditingReader] = useState<SkudReader | null | undefined>(undefined);
  const [editingController, setEditingController] = useState<SkudController | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const result = await callApi(getSkud());
      if (!cancelled) {
        if (result.ok) setData(result.data);
        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const afterSave = () => {
    setEditingGroup(undefined);
    setEditingReader(undefined);
    setEditingController(undefined);
    setReloadKey((key) => key + 1);
  };

  const controllerNames = useMemo(
    () => new Map(data.controllers.map((item) => [item.id, `${item.name} · ${item.ip}`])),
    [data.controllers],
  );

  const readerRows = useMemo<ReaderRow[]>(
    () =>
      data.readers.map((reader) => ({
        ...reader,
        controllerName: reader.controllerId != null ? controllerNames.get(reader.controllerId) ?? "" : "",
      })),
    [controllerNames, data.readers],
  );

  const match = (text: string) => includesNormalized(text, debouncedSearchText);

  const commonTableProps = {
    loading,
    addOption: true,
    searchPlaceholder: "Поиск",
    searchText,
    onSearchTextChange: setSearchText,
    highlightQuery: debouncedSearchText,
  };

  return (
    <>
      {section === "groups" ? (
        <GenericTable<SkudGroup>
          {...commonTableProps}
          data={data.groups.filter((item) => match(item.name))}
          columns={groupColumns}
          onAddClick={() => setEditingGroup(null)}
          onRowClick={setEditingGroup}
          tableStateKey="factory-skud-groups"
        />
      ) : section === "readers" ? (
        <GenericTable<ReaderRow>
          {...commonTableProps}
          data={readerRows.filter((item) => match(`${item.name} ${item.ip ?? ""} ${item.controllerName}`))}
          columns={readerColumns}
          onAddClick={() => setEditingReader(null)}
          onRowClick={setEditingReader}
          tableStateKey="factory-skud-readers"
        />
      ) : (
        <GenericTable<SkudController>
          {...commonTableProps}
          data={data.controllers.filter((item) => match(`${item.name} ${item.ip}`))}
          columns={controllerColumns}
          onAddClick={() => setEditingController(null)}
          onRowClick={setEditingController}
          tableStateKey="factory-skud-controllers"
        />
      )}

      <SkudGroupModal group={editingGroup} data={data} onClose={() => setEditingGroup(undefined)} onSaved={afterSave} />
      <SkudReaderModal reader={editingReader} data={data} onClose={() => setEditingReader(undefined)} onSaved={afterSave} />
      <SkudControllerModal controller={editingController} onClose={() => setEditingController(undefined)} onSaved={afterSave} />
    </>
  );
}

// responsivePriority: на телефоне остаются колонки с меньшим номером.
const groupColumns: Column<SkudGroup>[] = [
  { label: "Название", key: "name", responsivePriority: 0 },
  {
    label: "Считывателей",
    render: (row) => row.readerIds.length,
    sortValue: (row) => row.readerIds.length,
    responsivePriority: 2,
  },
  { label: "Сотрудников", key: "persons", responsivePriority: 1 },
];

const readerColumns: Column<ReaderRow>[] = [
  { label: "Название", key: "name", responsivePriority: 0 },
  { label: "Контроллер", render: (row) => row.controllerName || "—", sortValue: (row) => row.controllerName, responsivePriority: 1 },
  { label: "IP", render: (row) => row.ip ?? "", sortValue: (row) => row.ip ?? "", responsivePriority: 3 },
  { label: "Реле", key: "relay", responsivePriority: 4 },
  { label: "Тип команды", key: "commandType", responsivePriority: 5 },
  { label: "Время команды", key: "commandTime", responsivePriority: 6 },
  {
    label: "Монитор охраны",
    render: (row) => row.securityMonitor ?? "",
    sortValue: (row) => row.securityMonitor ?? "",
    defaultVisible: false,
    responsivePriority: 7,
  },
  { label: "Групп", key: "groups", responsivePriority: 2 },
];

const controllerColumns: Column<SkudController>[] = [
  { label: "Название", key: "name", responsivePriority: 0 },
  { label: "IP", key: "ip", responsivePriority: 2 },
  { label: "Тип", key: "type", responsivePriority: 3 },
  { label: "Считывателей", key: "readers", responsivePriority: 1 },
];
