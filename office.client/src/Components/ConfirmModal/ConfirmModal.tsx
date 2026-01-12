import React from "react";
import Modal from "../Modal/Modal";
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
  sx?: React.CSSProperties;
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
  sx,
}: ConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={isOpen ? title : ""} sx={sx}>
      <div className={styles.modalContent}>
        {img ? <img className={styles.modalImg} src={isOpen ? img : ""} alt="" /> : null}
        <p className={styles.modalText}>{isOpen ? message : ""}</p>

        <div className={styles.modalActions}>
          <button className={`${styles.modalButton} ${styles.confirmSecondary}`} onClick={onCancel}>
            {cancelLabel}
          </button>

          <button className={`${styles.modalButton} ${styles.confirmPrimary}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
