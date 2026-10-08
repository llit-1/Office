import { useEffect, useState } from "react";
import Button from "../../../Components/Button/Button";
import Modal from "../../../Components/Modal/Modal";
import Select from "../../../Components/Select/Select";
import type { CashClient, CashVersion } from "../cash.api";
import { cashTitle, compareVersions, MISSING_VERSION } from "../cashClients.utils";
import styles from "../CashUpdate.module.css";

interface CashInstallModalProps {
  /** Касса, для которой выбирается версия; null — окно закрыто. */
  cash: CashClient | null;
  versions: CashVersion[];
  /** Номер версии, которая сейчас стоит на кассе (или «—», null). */
  installed: string | null;
  /** Версия, выбранная по умолчанию, — та, что выбрана в панели. */
  defaultVersionId: number | null;
  onCancel: () => void;
  onConfirm: (cash: CashClient, version: CashVersion) => void;
}

/** Установка любой загруженной версии на одну кассу — в том числе откат на более старую. */
export default function CashInstallModal({ cash, versions, installed, defaultVersionId, onCancel, onConfirm }: CashInstallModalProps) {
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    if (!cash) return;
    setSelectedId(String(defaultVersionId ?? versions[0]?.id ?? ""));
  }, [cash, defaultVersionId, versions]);

  const selected = versions.find((entry) => String(entry.id) === selectedId) ?? null;
  const known = installed && installed !== MISSING_VERSION ? installed : null;
  const comparison = selected && known ? compareVersions(selected.version, known) : null;
  const action = comparison === null ? "Установить" : comparison < 0 ? "Откатить" : comparison === 0 ? "Переустановить" : "Обновить";

  return (
    <Modal isOpen={cash !== null} onClose={onCancel} title="Версия для кассы" size="sm" bodyClassName={styles.modalBody}>
      {cash && (
        <>
          <div className={styles.modalForm}>
            <p className={styles.installSummary}>
              <strong>{cashTitle(cash)}</strong>
              <span>Сейчас установлена: {installed ?? "неизвестно"}</span>
            </p>

            <Select
              label="Версия"
              wrapperClassName={styles.installSelect}
              options={versions.map((entry) => ({ value: String(entry.id), label: entry.version }))}
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              placeholder="Выберите версию"
            />

            {comparison !== null && comparison < 0 && (
              <p className={styles.rollbackNote}>
                Откат с {known} на {selected?.version}. Настройки кассы (точка, принтер) сохранятся.
              </p>
            )}

            <p className={styles.modalHint}>
              Монитор на кассе заберёт задачу сразу или в течение 5 минут, ход установки будет виден на карточке.
            </p>
          </div>

          <div className={styles.modalActions}>
            <Button variant="secondary" onClick={onCancel}>Отмена</Button>
            <Button variant="primary" disabled={!selected} onClick={() => selected && onConfirm(cash, selected)}>
              {action}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
