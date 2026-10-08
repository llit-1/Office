import Button from "../../../Components/Button/Button";
import Modal from "../../../Components/Modal/Modal";
import { formatDay } from "../orders.format";
import type { Order, OrderTypeConfig } from "../orders.types";
import styles from "./OrderDialogs.module.css";

interface CancelOrderModalProps {
  order: Order;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function CancelOrderModal({ order, busy, onClose, onConfirm }: CancelOrderModalProps) {
  return (
    <Modal isOpen onClose={() => !busy && onClose()} size="sm" title={`Отменить заказ № ${order.id}?`}>
      <div className={styles.form}>
        <p className={styles.text}>
          Заказ для «{order.storeName}» с доставкой {formatDay(order.deliveryDate)} не будет выполнен.
          Он останется в списке со статусом «Отменён».
        </p>
        <div className={styles.buttons}>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Не отменять</Button>
          <Button variant="danger" loading={busy} onClick={onConfirm}>Отменить заказ</Button>
        </div>
      </div>
    </Modal>
  );
}

interface TypePickerModalProps {
  types: OrderTypeConfig[];
  onClose: () => void;
  onPick: (type: OrderTypeConfig) => void;
}

export function TypePickerModal({ types, onClose, onPick }: TypePickerModalProps) {
  return (
    <Modal isOpen onClose={onClose} size="sm" closeOnBackdropClick title="Какой заказ оформить?">
      <ul className={styles.typeList}>
        {types.map((type) => (
          <li key={type.id}>
            <button type="button" className={styles.typeOption} onClick={() => onPick(type)}>{type.name}</button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
