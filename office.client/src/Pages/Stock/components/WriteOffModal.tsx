import { useEffect, useId, useState, type FormEvent } from "react";
import Button from "../../../Components/Button/Button";
import Modal from "../../../Components/Modal/Modal";
import Textarea from "../../../Components/Textarea/Textarea";
import { getStockErrorMessage, writeOffStockObject } from "../stock.api";
import type { StockObject } from "../stock.types";
import { formatObjectCode } from "../stock.utils";
import shared from "../StockShared.module.css";
import styles from "./StockModals.module.css";

type WriteOffModalProps = {
  isOpen: boolean;
  object: Pick<StockObject, "code" | "name"> | null;
  onClose: () => void;
  onWrittenOff: () => void;
};

export default function WriteOffModal({ isOpen, object, onClose, onWrittenOff }: WriteOffModalProps) {
  const errorId = useId();
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setComment("");
    setSubmitted(false);
    setError("");
  }, [isOpen]);

  const commentError = comment.trim().length >= 2 ? "" : "Укажите причину списания — хотя бы 2 символа.";
  const showCommentError = submitted && Boolean(commentError);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (!object || commentError || saving) return;

    setSaving(true);
    setError("");
    try {
      await writeOffStockObject(object.code, comment.trim());
      onWrittenOff();
    } catch (reason) {
      setError(getStockErrorMessage(reason, "Не удалось списать объект. Попробуйте ещё раз."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen && object !== null} onClose={onClose} title="Списание объекта" size="sm">
      {object ? (
        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.objectSummary}>
            <span className={styles.objectName}>{object.name}</span>
            <span className={shared.code}>{formatObjectCode(object.code)}</span>
          </div>
          <p className={styles.dangerNote}>
            Объект получит статус «Списан» и перестанет находиться в поиске активных объектов. Отменить списание в портале нельзя.
          </p>
          <div className={`${shared.field} ${showCommentError ? shared.invalid : ""}`}>
            <Textarea
              label="Причина списания *"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={1000}
              placeholder="Например: разбит экран, ремонт нецелесообразен"
              aria-required
              aria-invalid={showCommentError || undefined}
              aria-describedby={showCommentError ? errorId : undefined}
            />
            {showCommentError ? <p id={errorId} className={shared.fieldError}>{commentError}</p> : null}
          </div>
          {error ? <p className={styles.formError} role="alert">{error}</p> : null}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose} disabled={saving}>Отмена</Button>
            <Button type="submit" variant="danger" loading={saving}>Списать</Button>
          </div>
        </form>
      ) : null}
    </Modal>
  );
}
