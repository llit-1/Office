import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import Button from "../../Components/Button/Button";
import Input from "../../Components/Input/Input";
import Modal from "../../Components/Modal/Modal";
import Select from "../../Components/Select/Select";
import {
  createFactoryCombination,
  getFactoryStructureErrorMessage,
  type FactoryDictionaryItem,
  type FactoryDictionaryRef,
  type FactoryStructure,
} from "./factoryStructureApi";
import styles from "./FactoryStructure.module.css";

const NAME_MAX_LENGTH = 100;

/** Значение поля: выбранная запись справочника или название новой. */
type FieldValue = { mode: "select"; id: string } | { mode: "new"; name: string };

const emptyValue: FieldValue = { mode: "select", id: "" };

const toRef = (value: FieldValue): FactoryDictionaryRef | null => {
  if (value.mode === "select") return value.id ? { id: Number(value.id) } : null;
  const name = value.name.trim();
  return name ? { name } : null;
};

type DictionaryFieldProps = {
  label: string;
  placeholder: string;
  newLabel: string;
  items: FactoryDictionaryItem[];
  value: FieldValue;
  onChange: (value: FieldValue) => void;
  error: string;
  disabled: boolean;
};

/** Выбор из справочника с возможностью ввести новое название. */
function DictionaryField({ label, placeholder, newLabel, items, value, onChange, error, disabled }: DictionaryFieldProps) {
  const errorId = useId();
  const options = useMemo(() => items.map((item) => ({ value: String(item.id), label: item.name })), [items]);

  const existingMatch =
    value.mode === "new"
      ? items.find((item) => item.name.trim().toLocaleLowerCase("ru") === value.name.trim().toLocaleLowerCase("ru"))
      : undefined;

  return (
    <div className={`${styles.field} ${error ? styles.invalid : ""}`}>
      <div className={styles.fieldRow}>
        <div className={styles.fieldControl}>
          {value.mode === "select" ? (
            <Select
              label={`${label} *`}
              options={options}
              placeholder={placeholder}
              value={value.id}
              search
              disabled={disabled}
              onChange={(event) => onChange({ mode: "select", id: event.target.value })}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          ) : (
            <Input
              label={`${newLabel} *`}
              value={value.name}
              maxLength={NAME_MAX_LENGTH}
              autoFocus
              disabled={disabled}
              onChange={(event) => onChange({ mode: "new", name: event.target.value })}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? errorId : undefined}
            />
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className={styles.modeButton}
          disabled={disabled}
          onClick={() => onChange(value.mode === "select" ? { mode: "new", name: "" } : emptyValue)}
        >
          {value.mode === "select" ? "Создать" : "Из списка"}
        </Button>
      </div>
      {error ? <p id={errorId} className={styles.fieldError}>{error}</p> : null}
      {!error && existingMatch ? (
        <p className={styles.hint}>Такое название уже есть — будет использована существующая запись.</p>
      ) : null}
    </div>
  );
}

type FactoryCombinationModalProps = {
  isOpen: boolean;
  structure: FactoryStructure;
  onClose: () => void;
  onCreated: () => void;
};

export default function FactoryCombinationModal({ isOpen, structure, onClose, onCreated }: FactoryCombinationModalProps) {
  const [department, setDepartment] = useState<FieldValue>(emptyValue);
  const [workshop, setWorkshop] = useState<FieldValue>(emptyValue);
  const [jobTitle, setJobTitle] = useState<FieldValue>(emptyValue);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setDepartment(emptyValue);
    setWorkshop(emptyValue);
    setJobTitle(emptyValue);
    setSubmitted(false);
    setSaveError("");
  }, [isOpen]);

  const departmentRef = toRef(department);
  const workshopRef = toRef(workshop);
  const jobTitleRef = toRef(jobTitle);

  const errors = {
    department: submitted && !departmentRef ? (department.mode === "new" ? "Введите название отдела." : "Выберите отдел.") : "",
    workshop: submitted && !workshopRef ? (workshop.mode === "new" ? "Введите название участка." : "Выберите участок.") : "",
    jobTitle: submitted && !jobTitleRef ? (jobTitle.mode === "new" ? "Введите название должности." : "Выберите должность.") : "",
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!departmentRef || !workshopRef || !jobTitleRef || saving) return;

    setSaving(true);
    setSaveError("");
    try {
      await createFactoryCombination({ department: departmentRef, workshop: workshopRef, jobTitle: jobTitleRef });
      onCreated();
    } catch (error) {
      setSaveError(getFactoryStructureErrorMessage(error, "Не удалось создать комбинацию."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Новая комбинация" size="sm">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <p className={styles.intro}>
          Выберите значения из справочников или нажмите «Создать», чтобы добавить новое.
        </p>
        <DictionaryField
          label="Отдел"
          placeholder="Выберите отдел"
          newLabel="Новый отдел"
          items={structure.departments}
          value={department}
          onChange={setDepartment}
          error={errors.department}
          disabled={saving}
        />
        <DictionaryField
          label="Участок"
          placeholder="Выберите участок"
          newLabel="Новый участок"
          items={structure.workshops}
          value={workshop}
          onChange={setWorkshop}
          error={errors.workshop}
          disabled={saving}
        />
        <DictionaryField
          label="Должность"
          placeholder="Выберите должность"
          newLabel="Новая должность"
          items={structure.jobTitles}
          value={jobTitle}
          onChange={setJobTitle}
          error={errors.jobTitle}
          disabled={saving}
        />
        {saveError ? <p className={styles.error} role="alert">{saveError}</p> : null}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button type="submit" variant="primary" loading={saving}>Создать</Button>
        </div>
      </form>
    </Modal>
  );
}
