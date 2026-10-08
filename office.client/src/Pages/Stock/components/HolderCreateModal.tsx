import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from "react";
import Button from "../../../Components/Button/Button";
import Input from "../../../Components/Input/Input";
import Modal from "../../../Components/Modal/Modal";
import { createStockHolder, getStockErrorMessage } from "../stock.api";
import type { StockHolderForm, StockHolderOption } from "../stock.types";
import shared from "../StockShared.module.css";
import styles from "./StockModals.module.css";

const emptyForm: StockHolderForm = { surname: "", name: "", patronymic: "", jobTitle: "", department: "" };
const MAX_FIELD_LENGTH = 100;

type HolderCreateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (holder: StockHolderOption | null) => void;
};

export default function HolderCreateModal({ isOpen, onClose, onCreated }: HolderCreateModalProps) {
  const id = useId();
  const [form, setForm] = useState(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setForm(emptyForm);
    setSubmitted(false);
    setError("");
  }, [isOpen]);

  const requiredErrors: Partial<Record<keyof StockHolderForm, string>> = {
    surname: form.surname.trim() ? "" : "Укажите фамилию.",
    name: form.name.trim() ? "" : "Укажите имя.",
  };

  const update = (field: keyof StockHolderForm) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (requiredErrors.surname || requiredErrors.name || saving) return;

    setSaving(true);
    setError("");
    try {
      onCreated(await createStockHolder(form));
    } catch (reason) {
      setError(getStockErrorMessage(reason, "Не удалось добавить держателя. Попробуйте ещё раз."));
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: keyof StockHolderForm, label: string, required = false) => {
    const message = required && submitted ? requiredErrors[field] : "";
    const errorId = `${id}-${field}-error`;

    return (
      <div className={`${shared.field} ${message ? shared.invalid : ""}`}>
        <Input
          label={required ? `${label} *` : label}
          value={form[field]}
          onChange={update(field)}
          maxLength={MAX_FIELD_LENGTH}
          aria-required={required || undefined}
          aria-invalid={message ? true : undefined}
          aria-describedby={message ? errorId : undefined}
        />
        {message ? <p id={errorId} className={shared.fieldError}>{message}</p> : null}
      </div>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Новый держатель" size="sm">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <p className={shared.muted}>
          Поля со звёздочкой обязательны. После сохранения держатель сразу будет выбран в форме передачи.
        </p>
        {renderField("surname", "Фамилия", true)}
        {renderField("name", "Имя", true)}
        {renderField("patronymic", "Отчество")}
        {renderField("jobTitle", "Должность")}
        {renderField("department", "Отдел")}
        {error ? <p className={styles.formError} role="alert">{error}</p> : null}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button type="submit" variant="primary" loading={saving}>Добавить</Button>
        </div>
      </form>
    </Modal>
  );
}
