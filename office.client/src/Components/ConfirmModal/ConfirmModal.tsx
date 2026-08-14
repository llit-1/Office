import Modal from "../Modal/Modal";
import Button from "../Button/Button";
import styles from "./ConfirmModal.module.css";

type ConfirmModalProps = {
  isOpen: boolean;
  title?: string;
  message?: string;
  img?: string;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  panelClassName?: string;
};

export default function ConfirmModal({
  isOpen,
  title,
  message,
  img,
  onCancel,
  onConfirm,
  confirmLabel = "Да",
  cancelLabel = "Нет",
  panelClassName,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={isOpen ? title : ""} panelClassName={panelClassName}>
      <div className={styles.modalContent}>
        {img ? <img className={styles.modalImg} src={isOpen ? img : ""} alt="" /> : null}
        <p className={styles.modalText}>{isOpen ? message : ""}</p>

        <div className={styles.modalActions}>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>

          <Button variant="primary" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
