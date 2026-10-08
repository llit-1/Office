import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import BusinessRoundedIcon from "@mui/icons-material/BusinessRounded";
import FolderRoundedIcon from "@mui/icons-material/FolderRounded";
import Button from "../../../Components/Button/Button";
import ConfirmModal from "../../../Components/ConfirmModal/ConfirmModal";
import Input from "../../../Components/Input/Input";
import LoadingSpinner from "../../../Components/LoadingSpinner/LoadingSpinner";
import Modal from "../../../Components/Modal/Modal";
import Toggle from "../../../Components/Toggle/Toggle";
import {
  createEntity,
  getEntity,
  getTTErrorMessage,
  isFolderNotEmptyError,
  updateEntity,
  type EntityEditModel,
} from "../ttApi";
import styles from "./TTModals.module.css";

type EntityEditModalProps = {
  isOpen: boolean;
  /** null — создание новой организации. */
  entityId: string | null;
  onClose: () => void;
  onSaved: () => void;
};

type EntityForm = {
  name: string;
  owns: boolean;
  folder: boolean;
};

const EMPTY_FORM: EntityForm = { name: "", owns: true, folder: false };

type FolderTone = "neutral" | "warning" | "danger";

function folderHint(folder: EntityEditModel | null, wantsFolder: boolean): { text: string; tone: FolderTone } {
  if (folder && !folder.folderAvailable) {
    return {
      text: "Сетевая папка «Розница. Документы» сейчас недоступна: создать или удалить папку не получится.",
      tone: "warning",
    };
  }
  if (folder?.folderExists) {
    const files = folder.folderFileCount > 0 ? ` Файлов в папке: ${folder.folderFileCount}.` : " Папка пустая.";
    return wantsFolder
      ? { text: `Папка существует.${files}`, tone: "neutral" }
      : { text: `Папка будет удалена при сохранении.${files}`, tone: "danger" };
  }
  return wantsFolder
    ? { text: "При сохранении в «Розница. Документы» будет создана папка с названием организации.", tone: "neutral" }
    : { text: "Папки на диске нет.", tone: "neutral" };
}

type OptionRowProps = {
  icon: ReactNode;
  title: string;
  description: string;
  descriptionTone?: FolderTone;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
  children?: ReactNode;
};

/** Строка настройки: иконка, заголовок с пояснением и переключатель справа; кликабельна целиком. */
function OptionRow({ icon, title, description, descriptionTone = "neutral", checked, disabled, onChange, children }: OptionRowProps) {
  return (
    <div className={styles.option}>
      <Toggle
        ariaLabel={title}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        containerClassName={styles.optionToggle}
        labelClassName={styles.optionLabel}
        label={
          <>
            <span className={`${styles.optionIcon} ${checked ? styles.optionIconActive : ""}`} aria-hidden="true">
              {icon}
            </span>
            <span className={styles.optionText}>
              <span className={styles.optionTitle}>{title}</span>
              <span className={`${styles.optionDescription} ${styles[`tone_${descriptionTone}`] ?? ""}`}>
                {description}
              </span>
            </span>
          </>
        }
      />
      {children}
    </div>
  );
}

export default function EntityEditModal({ isOpen, entityId, onClose, onSaved }: EntityEditModalProps) {
  const nameErrorId = useId();
  const [form, setForm] = useState<EntityForm>(EMPTY_FORM);
  const [folder, setFolder] = useState<EntityEditModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!isOpen) return undefined;
    setSubmitted(false);
    setSaveError("");
    setConfirmMessage(null);
    setLoadError("");

    if (!entityId) {
      setForm(EMPTY_FORM);
      setFolder(null);
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    getEntity(entityId)
      .then((entity) => {
        if (cancelled) return;
        setFolder(entity);
        setForm({ name: entity.name, owns: entity.owner === 1, folder: entity.folderExists });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(getTTErrorMessage(error, "Не удалось загрузить организацию."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entityId, isOpen, reloadKey]);

  const nameError = form.name.trim() ? "" : "Укажите название организации.";

  const save = async (confirmFolderDeletion: boolean) => {
    setSaving(true);
    setSaveError("");
    const payload = { name: form.name.trim(), owner: form.owns ? 1 : 0, folder: form.folder, confirmFolderDeletion };
    try {
      if (entityId) await updateEntity(entityId, payload);
      else await createEntity(payload);
      onSaved();
    } catch (error) {
      if (isFolderNotEmptyError(error)) {
        setConfirmMessage(getTTErrorMessage(error, "В папке организации есть файлы."));
      } else {
        setSaveError(getTTErrorMessage(error, "Не удалось сохранить организацию."));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (nameError || saving) return;
    void save(false);
  };

  const showNameError = submitted && Boolean(nameError);
  const folderUnavailable = folder !== null && !folder.folderAvailable;
  const hint = folderHint(folder, form.folder);

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={entityId ? "Организация" : "Новая организация"} size="sm">
        {loading ? (
          <div className={styles.loading}><LoadingSpinner size={56} label="Загружаем организацию…" /></div>
        ) : loadError ? (
          <div className={styles.form}>
            <p className={styles.error} role="alert">{loadError}</p>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={onClose}>Закрыть</Button>
              <Button variant="primary" onClick={() => setReloadKey((key) => key + 1)}>Повторить</Button>
            </div>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <div className={`${styles.field} ${showNameError ? styles.invalid : ""}`}>
              <Input
                label="Название *"
                value={form.name}
                maxLength={200}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                aria-invalid={showNameError || undefined}
                aria-describedby={showNameError ? nameErrorId : undefined}
              />
              {showNameError ? <p id={nameErrorId} className={styles.fieldError}>{nameError}</p> : null}
            </div>

            <section className={styles.optionsGroup} aria-label="Параметры организации">
              <OptionRow
                icon={<BusinessRoundedIcon fontSize="small" />}
                title="Принадлежит ЛЛ"
                description={form.owns ? "Организация входит в ЛЛ." : "Сторонняя организация, не входит в ЛЛ."}
                checked={form.owns}
                disabled={saving}
                onChange={(value) => setForm((prev) => ({ ...prev, owns: value }))}
              />

              <OptionRow
                icon={<FolderRoundedIcon fontSize="small" />}
                title="Папка на диске"
                description={hint.text}
                descriptionTone={hint.tone}
                checked={form.folder}
                disabled={saving || folderUnavailable}
                onChange={(value) => setForm((prev) => ({ ...prev, folder: value }))}
              >
                {folder?.folderExists && folder.folderPath ? (
                  <code className={styles.folderPath} title={folder.folderPath}>{folder.folderPath}</code>
                ) : null}
              </OptionRow>
            </section>

            {saveError ? <p className={styles.error} role="alert">{saveError}</p> : null}
            <div className={styles.actions}>
              <Button variant="secondary" onClick={onClose} disabled={saving}>Отмена</Button>
              <Button type="submit" variant="primary" loading={saving}>{entityId ? "Сохранить" : "Создать"}</Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmModal
        isOpen={confirmMessage !== null}
        title="Удалить папку вместе с файлами?"
        message={`${confirmMessage ?? ""} Файлы будут удалены безвозвратно.`}
        confirmLabel="Удалить папку"
        cancelLabel="Отмена"
        onCancel={() => setConfirmMessage(null)}
        onConfirm={() => {
          setConfirmMessage(null);
          void save(true);
        }}
      />
    </>
  );
}
