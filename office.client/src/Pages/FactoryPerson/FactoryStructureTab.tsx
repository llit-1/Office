import { useEffect, useMemo, useState } from "react";
import Button from "../../Components/Button/Button";
import GenericTable, { type Column } from "../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../Components/GenericTable/searchUtils";
import Modal from "../../Components/Modal/Modal";
import useDebouncedValue from "../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../Hooks/usePersistedSearchText";
import { callApi } from "../../Services/api";
import FactoryCombinationModal from "./FactoryCombinationModal";
import {
  deleteFactoryCombination,
  getFactoryStructure,
  getFactoryStructureErrorMessage,
  type FactoryCombination,
  type FactoryStructure,
} from "./factoryStructureApi";
import styles from "./FactoryStructure.module.css";

const tableStateKey = "factory-structure-list";

type CombinationRow = FactoryCombination & { id: string };

const columns: Column<CombinationRow>[] = [
  { label: "Отдел", key: "departmentName", responsivePriority: 0 },
  { label: "Участок", key: "workshopName", responsivePriority: 1 },
  { label: "Должность", key: "jobTitleName", responsivePriority: 2 },
  { label: "Активных сотрудников", key: "activePersons", responsivePriority: 3 },
];

const emptyStructure: FactoryStructure = { departments: [], workshops: [], jobTitles: [], combinations: [] };

export default function FactoryStructureTab() {
  const [searchText, setSearchText] = usePersistedSearchText(tableStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [loading, setLoading] = useState(true);
  const [structure, setStructure] = useState<FactoryStructure>(emptyStructure);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<CombinationRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      const result = await callApi(getFactoryStructure());

      if (!cancelled) {
        if (result.ok) setStructure(result.data);
        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const rows = useMemo<CombinationRow[]>(
    () =>
      structure.combinations.map((item) => ({
        ...item,
        id: `${item.departmentId}-${item.workshopId}-${item.jobTitleId}`,
      })),
    [structure.combinations],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        includesNormalized(`${row.departmentName} ${row.workshopName} ${row.jobTitleName}`, debouncedSearchText),
      ),
    [debouncedSearchText, rows],
  );

  const openDetails = (row: CombinationRow) => {
    setDeleteError("");
    setSelected(row);
  };

  const handleDelete = async () => {
    if (!selected || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteFactoryCombination(selected);
      setSelected(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      setDeleteError(getFactoryStructureErrorMessage(error, "Не удалось удалить комбинацию."));
    } finally {
      setDeleting(false);
    }
  };

  const canDelete = selected ? selected.activePersons === 0 : false;

  return (
    <>
      <GenericTable<CombinationRow>
        data={filteredRows}
        columns={columns}
        loading={loading}
        addOption
        onAddClick={() => setCreating(true)}
        onRowClick={openDetails}
        tableStateKey={tableStateKey}
        searchPlaceholder="Поиск"
        searchText={searchText}
        onSearchTextChange={setSearchText}
        highlightQuery={debouncedSearchText}
      />

      <FactoryCombinationModal
        isOpen={creating}
        structure={structure}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          setReloadKey((key) => key + 1);
        }}
      />

      <Modal isOpen={selected !== null} onClose={() => setSelected(null)} title="Комбинация" size="sm">
        {selected ? (
          <div className={styles.form}>
            <dl className={styles.details}>
              <dt>Отдел</dt>
              <dd>{selected.departmentName}</dd>
              <dt>Участок</dt>
              <dd>{selected.workshopName}</dd>
              <dt>Должность</dt>
              <dd>{selected.jobTitleName}</dd>
              <dt>Активных сотрудников</dt>
              <dd>{selected.activePersons}</dd>
            </dl>
            {!canDelete ? (
              <p className={styles.hint}>
                Удалить нельзя, пока на комбинации числятся активные сотрудники.
              </p>
            ) : null}
            {deleteError ? <p className={styles.error} role="alert">{deleteError}</p> : null}
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setSelected(null)} disabled={deleting}>Закрыть</Button>
              <Button variant="danger" onClick={handleDelete} loading={deleting} disabled={!canDelete}>Удалить</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
