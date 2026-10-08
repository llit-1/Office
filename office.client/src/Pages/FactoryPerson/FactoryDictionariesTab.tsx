import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import Button from "../../Components/Button/Button";
import GenericTable, { type Column } from "../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../Components/GenericTable/searchUtils";
import Input from "../../Components/Input/Input";
import Modal from "../../Components/Modal/Modal";
import Select from "../../Components/Select/Select";
import useDebouncedValue from "../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../Hooks/usePersistedSearchText";
import { callApi } from "../../Services/api";
import {
  createFactoryDictionaryItem,
  deleteFactoryDictionaryItem,
  getFactoryDictionary,
  getFactoryStructureErrorMessage,
  type FactoryDictionaryKind,
  type FactoryDictionaryRow,
} from "./factoryStructureApi";
import styles from "./FactoryStructure.module.css";

type DictionaryConfig = {
  kind: FactoryDictionaryKind;
  title: string;
  /** Заголовок окна создания: «Новое юр. лицо». */
  newTitle: string;
  usageLabel: string;
};

const dictionaries: DictionaryConfig[] = [
  { kind: "entities", title: "Юр. лица", newTitle: "Новое юр. лицо", usageLabel: "Сотрудников" },
  { kind: "documentTypes", title: "Типы документов", newTitle: "Новый тип документа", usageLabel: "Сотрудников" },
  { kind: "citizenshipTypes", title: "Типы гражданства", newTitle: "Новый тип гражданства", usageLabel: "Гражданств" },
  { kind: "citizenships", title: "Гражданства", newTitle: "Новое гражданство", usageLabel: "Сотрудников" },
  { kind: "banks", title: "Банки", newTitle: "Новый банк", usageLabel: "Сотрудников" },
];

const DICTIONARY_PARAM = "dict";
const searchStateKey = "factory-dictionary-list";

/** Выбранный справочник хранится в ?dict=, чтобы выбор переживал перезагрузку и работал из строки вкладок. */
function useSelectedDictionary() {
  const [searchParams, setSearchParams] = useSearchParams();
  const config = dictionaries.find((item) => item.kind === searchParams.get(DICTIONARY_PARAM)) ?? dictionaries[0];

  const select = (kind: string) => {
    const next = new URLSearchParams(searchParams);
    next.set(DICTIONARY_PARAM, kind);
    setSearchParams(next, { replace: true });
  };

  return [config, select] as const;
}

/** Выбор справочника; стоит в строке вкладок страницы, чтобы не отнимать высоту у таблицы. */
export function FactoryDictionaryPicker() {
  const [config, select] = useSelectedDictionary();

  return (
    <div className={styles.dictionaryPicker}>
      <Select
        label="Справочник"
        hideLabel
        wrapperClassName={styles.pickerField}
        options={dictionaries.map((item) => ({ value: item.kind, label: item.title }))}
        value={config.kind}
        onChange={(event) => select(event.target.value)}
      />
    </div>
  );
}

export default function FactoryDictionariesTab() {
  const [config] = useSelectedDictionary();

  const [searchText, setSearchText] = usePersistedSearchText(searchStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FactoryDictionaryRow[]>([]);
  const [citizenshipTypes, setCitizenshipTypes] = useState<FactoryDictionaryRow[]>([]);
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<FactoryDictionaryRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setItems([]);
      const [result, typesResult] = await Promise.all([
        callApi(getFactoryDictionary(config.kind)),
        config.kind === "citizenships" ? callApi(getFactoryDictionary("citizenshipTypes")) : Promise.resolve(null),
      ]);

      if (!cancelled) {
        if (result.ok) setItems(result.data);
        if (typesResult?.ok) setCitizenshipTypes(typesResult.data);
        setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [config.kind, reloadKey]);

  const columns = useMemo<Column<FactoryDictionaryRow>[]>(
    () => [
      { label: "Название", key: "name", responsivePriority: 0 },
      ...(config.kind === "citizenships"
        ? [{
            label: "Тип гражданства",
            render: (row: FactoryDictionaryRow) => row.parentName ?? "",
            sortValue: (row: FactoryDictionaryRow) => row.parentName ?? "",
            responsivePriority: 1,
          }]
        : []),
      { label: config.usageLabel, key: "usage", responsivePriority: 2 },
    ],
    [config.kind, config.usageLabel],
  );

  const filteredItems = useMemo(
    () => items.filter((item) => includesNormalized(`${item.name} ${item.parentName ?? ""}`, debouncedSearchText)),
    [debouncedSearchText, items],
  );

  const handleDelete = async () => {
    if (!selected || deleting) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteFactoryDictionaryItem(config.kind, selected.id);
      setSelected(null);
      setReloadKey((key) => key + 1);
    } catch (error) {
      setDeleteError(getFactoryStructureErrorMessage(error, "Не удалось удалить значение."));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <GenericTable<FactoryDictionaryRow>
        data={filteredItems}
        columns={columns}
        loading={loading}
        addOption
        onAddClick={() => setCreating(true)}
        onRowClick={(row) => {
          setDeleteError("");
          setSelected(row);
        }}
        tableStateKey={`factory-dictionary-${config.kind}`}
        searchPlaceholder="Поиск"
        searchText={searchText}
        onSearchTextChange={setSearchText}
        highlightQuery={debouncedSearchText}
      />

      <DictionaryCreateModal
        isOpen={creating}
        config={config}
        citizenshipTypes={citizenshipTypes}
        onClose={() => setCreating(false)}
        onCreated={() => {
          setCreating(false);
          setReloadKey((key) => key + 1);
        }}
      />

      <Modal isOpen={selected !== null} onClose={() => setSelected(null)} title={config.title} size="sm">
        {selected ? (
          <div className={styles.form}>
            <dl className={styles.details}>
              <dt>Название</dt>
              <dd>{selected.name}</dd>
              {config.kind === "citizenships" ? (
                <>
                  <dt>Тип гражданства</dt>
                  <dd>{selected.parentName ?? "—"}</dd>
                </>
              ) : null}
              <dt>{config.usageLabel}</dt>
              <dd>{selected.usage}</dd>
            </dl>
            {selected.usage > 0 ? (
              <p className={styles.hint}>Удалить нельзя, пока значение используется.</p>
            ) : null}
            {deleteError ? <p className={styles.error} role="alert">{deleteError}</p> : null}
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setSelected(null)} disabled={deleting}>Закрыть</Button>
              <Button variant="danger" onClick={handleDelete} loading={deleting} disabled={selected.usage > 0}>
                Удалить
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}

type DictionaryCreateModalProps = {
  isOpen: boolean;
  config: DictionaryConfig;
  citizenshipTypes: FactoryDictionaryRow[];
  onClose: () => void;
  onCreated: () => void;
};

function DictionaryCreateModal({ isOpen, config, citizenshipTypes, onClose, onCreated }: DictionaryCreateModalProps) {
  const nameErrorId = useId();
  const parentErrorId = useId();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const needsParent = config.kind === "citizenships";

  useEffect(() => {
    if (!isOpen) return;
    setName("");
    setParentId("");
    setSubmitted(false);
    setSaveError("");
  }, [isOpen]);

  const nameError = submitted && !name.trim() ? "Укажите название." : "";
  const parentError = submitted && needsParent && !parentId ? "Выберите тип гражданства." : "";

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!name.trim() || (needsParent && !parentId) || saving) return;

    setSaving(true);
    setSaveError("");
    try {
      await createFactoryDictionaryItem(config.kind, {
        name: name.trim(),
        ...(needsParent ? { parentId: Number(parentId) } : {}),
      });
      onCreated();
    } catch (error) {
      setSaveError(getFactoryStructureErrorMessage(error, "Не удалось добавить значение."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={config.newTitle} size="sm">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        {needsParent ? (
          <div className={`${styles.field} ${parentError ? styles.invalid : ""}`}>
            <Select
              label="Тип гражданства *"
              options={citizenshipTypes.map((item) => ({ value: String(item.id), label: item.name }))}
              placeholder="Выберите тип гражданства"
              value={parentId}
              search
              disabled={saving}
              onChange={(event) => setParentId(event.target.value)}
              aria-invalid={parentError ? true : undefined}
              aria-describedby={parentError ? parentErrorId : undefined}
            />
            {parentError ? <p id={parentErrorId} className={styles.fieldError}>{parentError}</p> : null}
          </div>
        ) : null}
        <div className={`${styles.field} ${nameError ? styles.invalid : ""}`}>
          <Input
            label="Название *"
            value={name}
            autoFocus
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? nameErrorId : undefined}
          />
          {nameError ? <p id={nameErrorId} className={styles.fieldError}>{nameError}</p> : null}
        </div>
        {saveError ? <p className={styles.error} role="alert">{saveError}</p> : null}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button type="submit" variant="primary" loading={saving}>Добавить</Button>
        </div>
      </form>
    </Modal>
  );
}
