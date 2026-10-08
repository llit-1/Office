import { useEffect, useState, type FormEvent } from "react";
import Button from "../../../Components/Button/Button";
import Input from "../../../Components/Input/Input";
import Modal from "../../../Components/Modal/Modal";
import { getRequestErrorMessage, loadSales } from "../deliveryRequests.api";
import styles from "../DeliveryRequests.module.css";

type SalesLoadModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onLoaded: (date: string) => void;
};

const toDateInput = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// Обычно подгружают завершённые сутки — по умолчанию вчера.
const yesterday = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return toDateInput(date);
};

/** Подгрузка продаж Яндекса за выбранный день (по всем точкам сразу). */
export default function SalesLoadModal({ isOpen, onClose, onLoaded }: SalesLoadModalProps) {
  const [date, setDate] = useState(yesterday);
  const [submitted, setSubmitted] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setDate(yesterday());
    setSubmitted(false);
    setError("");
  }, [isOpen]);

  const today = toDateInput(new Date());
  const dateError = !date ? "Укажите дату." : date > today ? "Нельзя подгрузить продажи за будущую дату." : "";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (dateError || running) return;
    setRunning(true);
    setError("");
    try {
      await loadSales(date);
      onLoaded(date);
    } catch (reason) {
      setError(getRequestErrorMessage(reason, "Не удалось подгрузить продажи."));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={running ? () => undefined : onClose} title="Подгрузить продажи" size="sm">
      <form className={styles.modalForm} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <Input
            label="Дата продаж *"
            type="date"
            value={date}
            max={today}
            disabled={running}
            onChange={(event) => setDate(event.target.value)}
          />
          {submitted && dateError ? <p className={styles.fieldError}>{dateError}</p> : null}
        </div>
        {error ? <p className={styles.fieldError} role="alert">{error}</p> : null}
        <div className={styles.modalActions}>
          <Button variant="secondary" onClick={onClose} disabled={running}>Отмена</Button>
          <Button type="submit" variant="primary" loading={running}>Подгрузить</Button>
        </div>
      </form>
    </Modal>
  );
}
