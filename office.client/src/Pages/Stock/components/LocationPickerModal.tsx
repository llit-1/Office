import { useEffect, useState } from "react";
import Button from "../../../Components/Button/Button";
import Modal from "../../../Components/Modal/Modal";
import { MultiplySelect } from "../../../Components/MultiplySelect/MultiplySelect";
import type { StockLocationOption } from "../stock.types";
import styles from "./StockModals.module.css";

const getLocationKey = (location: StockLocationOption) => location.guid;
export const getLocationLabel = (location: StockLocationOption) =>
  location.actual ? location.name : `${location.name} (неактивна)`;

type LocationPickerModalProps = {
  isOpen: boolean;
  locations: StockLocationOption[];
  selected: string[];
  onClose: () => void;
  onApply: (guids: string[]) => void;
};

export default function LocationPickerModal({ isOpen, locations, selected, onClose, onApply }: LocationPickerModalProps) {
  const [draft, setDraft] = useState<string[]>(selected);

  useEffect(() => {
    if (isOpen) setDraft(selected);
  }, [isOpen, selected]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Торговые точки" size="md">
      <div className={styles.picker}>
        <MultiplySelect
          label="Поиск точки"
          placeholder="Название торговой точки"
          items={locations}
          getKey={getLocationKey}
          getLabel={getLocationLabel}
          selectedKeys={draft}
          onChange={(keys) => setDraft(keys.map(String))}
        />
        <div className={styles.actions}>
          <Button variant="ghost" className={styles.actionsStart} onClick={() => setDraft([])} disabled={draft.length === 0}>
            Снять выбор
          </Button>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
          <Button variant="primary" onClick={() => onApply(draft)}>
            {draft.length > 0 ? `Применить (${draft.length})` : "Применить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
