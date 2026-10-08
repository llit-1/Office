import { useEffect, useRef, useState } from "react";
import FolderZipOutlinedIcon from "@mui/icons-material/FolderZipOutlined";
import Button from "../../../Components/Button/Button";
import Input from "../../../Components/Input/Input";
import Modal from "../../../Components/Modal/Modal";
import styles from "../CashUpdate.module.css";

interface CashVersionModalProps {
  isOpen: boolean;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (version: string, file: File) => void;
}

const VERSION_PATTERN = /^\d+(\.\d+){1,3}$/;

function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} МБ` : `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

export default function CashVersionModal({ isOpen, saving, error, onClose, onSubmit }: CashVersionModalProps) {
  const [version, setVersion] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) return;
    setVersion("");
    setFile(null);
    setFormError("");
    if (fileRef.current) fileRef.current.value = "";
  }, [isOpen]);

  const submit = () => {
    const trimmed = version.trim();
    if (!VERSION_PATTERN.test(trimmed)) {
      setFormError("Номер версии указывается цифрами через точку, например 1.4.8.0.");
      return;
    }
    if (!file) {
      setFormError("Выберите zip-архив с дистрибутивом.");
      return;
    }
    setFormError("");
    onSubmit(trimmed, file);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Добавить новую версию" size="sm" bodyClassName={styles.modalBody}>
      <div className={styles.modalForm}>
        <Input
          label="Версия"
          value={version}
          onChange={(event) => { setVersion(event.target.value); setFormError(""); }}
          placeholder="1.4.8.0"
          inputMode="decimal"
          disabled={saving}
          autoFocus
        />

        <label className={styles.filePicker} data-filled={file ? "true" : undefined}>
          <FolderZipOutlinedIcon aria-hidden="true" />
          <span className={styles.filePickerBody}>
            <strong>{file ? file.name : "Выбрать zip-архив"}</strong>
            <small>{file ? formatSize(file.size) : "Дистрибутив кассового клиента"}</small>
          </span>
          <span className={styles.filePickerAction}>{file ? "Заменить" : "Обзор"}</span>
          <input
            ref={fileRef}
            type="file"
            accept=".zip,application/zip"
            disabled={saving}
            onChange={(event) => { setFile(event.target.files?.[0] ?? null); setFormError(""); }}
          />
        </label>

        <p className={styles.modalHint}>Кассы не обновятся сами — версия ставится кнопкой «Установить на все кассы».</p>

        {(formError || error) && <p role="alert" className={styles.formError}>{formError || error}</p>}
      </div>

      <div className={styles.modalActions}>
        <Button variant="secondary" disabled={saving} onClick={onClose}>Отмена</Button>
        <Button variant="primary" loading={saving} onClick={submit}>Добавить</Button>
      </div>
    </Modal>
  );
}
