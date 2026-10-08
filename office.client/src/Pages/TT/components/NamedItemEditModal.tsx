import { useEffect, useId, useState, type FormEvent } from "react";
import Button from "../../../Components/Button/Button";
import Input from "../../../Components/Input/Input";
import Modal from "../../../Components/Modal/Modal";
import { getTTErrorMessage } from "../ttApi";
import styles from "./TTModals.module.css";

type NamedItemEditModalProps = {
  isOpen: boolean;
  title: string;
  label: string;
  maxLength: number;
  initialName: string;
  /** Текст ошибки пустого поля, например «Укажите название должности». */
  requiredMessage: string;
  isCreate: boolean;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
};

/** Редактор справочника из одного поля «Название»: должности и типы локаций. */
export default function NamedItemEditModal({
  isOpen,
  title,
  label,
  maxLength,
  initialName,
  requiredMessage,
  isCreate,
  onClose,
  onSave,
}: NamedItemEditModalProps) {
  const errorId = useId();
  const [name, setName] = useState(initialName);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName);
    setSubmitted(false);
    setSaveError("");
  }, [initialName, isOpen]);

  const nameError = name.trim() ? "" : requiredMessage;
  const showNameError = submitted && Boolean(nameError);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (nameError || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      await onSave(name.trim());
    } catch (error) {
      setSaveError(getTTErrorMessage(error, "Не удалось сохранить."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <form className={styles.form} onSubmit={handleSubmit} noValidate>
        <div className={`${styles.field} ${showNameError ? styles.invalid : ""}`}>
          <Input
            label={`${label} *`}
            value={name}
            maxLength={maxLength}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={showNameError || undefined}
            aria-describedby={showNameError ? errorId : undefined}
          />
          {showNameError ? <p id={errorId} className={styles.fieldError}>{nameError}</p> : null}
        </div>
        {saveError ? <p className={styles.error} role="alert">{saveError}</p> : null}
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button type="submit" variant="primary" loading={saving}>{isCreate ? "Создать" : "Сохранить"}</Button>
        </div>
      </form>
    </Modal>
  );
}
