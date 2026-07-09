import Modal from "../../../Components/Modal/Modal";
import Select from "../../../Components/Select/Select";
import styles from "../VideoDevices.module.css";

type ReplaceVideoModalProps = {
  isOpen: boolean;
  usedVideoNames: string[];
  replaceFromVideo: string;
  replaceToVideo: string;
  onReplaceFromVideoChange: (value: string) => void;
  onReplaceToVideoChange: (value: string) => void;
  onClose: () => void;
  onReplace: () => void;
};

export default function ReplaceVideoModal({
  isOpen,
  usedVideoNames,
  replaceFromVideo,
  replaceToVideo,
  onReplaceFromVideoChange,
  onReplaceToVideoChange,
  onClose,
  onReplace,
}: ReplaceVideoModalProps) {
  const videoOptions = usedVideoNames.map((name) => ({ value: name, label: name }));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Замена видео" panelClassName={styles.replaceModalPanel}>
      <div className={styles.form}>
        <Select
          label="Что заменить"
          search
          value={replaceFromVideo}
          options={videoOptions}
          placeholder="Выберите видео"
          onChange={(event) => onReplaceFromVideoChange(event.target.value)}
        />
        <Select
          label="На что заменить"
          search
          value={replaceToVideo}
          options={videoOptions}
          placeholder="Выберите видео"
          onChange={(event) => onReplaceToVideoChange(event.target.value)}
        />
        <div className={styles.modalActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Отмена
          </button>
          <button type="button" className={styles.primaryButton} onClick={onReplace} disabled={!replaceFromVideo || !replaceToVideo}>
            Заменить
          </button>
        </div>
      </div>
    </Modal>
  );
}
