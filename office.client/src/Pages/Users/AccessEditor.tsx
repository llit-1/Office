import type { FormEventHandler, ReactNode } from "react";
import Button from "../../Components/Button/Button";
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import styles from "./AccessEditor.module.css";

export function AccessEditorHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className={styles.heading}>
      <span className={styles.icon} aria-hidden="true">
        {icon}
      </span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function AccessEditor({
  children,
  onSubmit,
  onCancel,
  onDelete,
  saving,
  isDirty,
  isCreate,
  error,
}: {
  children: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onCancel: () => void;
  onDelete: () => void;
  saving: boolean;
  isDirty: boolean;
  isCreate: boolean;
  error: string | null;
}) {
  return (
    <div className={styles.page}>
      <form
        className={styles.editor}
        onSubmit={onSubmit}
        noValidate
        aria-busy={saving}
      >
        <fieldset className={styles.layout} disabled={saving}>
          {children}
        </fieldset>
        {error && (
          <p className={styles.errorBanner} role="alert">
            {error}
          </p>
        )}
        <footer className={styles.footer}>
          <div className={styles.saveState} role="status">
            {isDirty ? (
              <span className={styles.dirtyDot} />
            ) : (
              <CheckCircleOutlineIcon aria-hidden="true" />
            )}
            <span>
              {saving
                ? "Сохраняем изменения…"
                : isDirty
                  ? "Есть несохранённые изменения"
                  : isCreate
                    ? "Заполните данные"
                    : "Все изменения сохранены"}
            </span>
          </div>
          <div className={styles.actions}>
            {!isCreate && (
              <Button
                variant="ghost"
                className={styles.deleteButton}
                onClick={onDelete}
                disabled={saving}
                leadingIcon={<DeleteOutlineIcon />}
              >
                Удалить
              </Button>
            )}
            <Button onClick={onCancel} disabled={saving}>
              Отмена
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              disabled={!isDirty && !isCreate}
              leadingIcon={<SaveOutlinedIcon />}
            >
              {isCreate ? "Создать" : "Сохранить"}
            </Button>
          </div>
        </footer>
      </form>
    </div>
  );
}
