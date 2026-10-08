import { useEffect, useState, type FormEvent } from "react";
import Button from "../../../Components/Button/Button";
import ConfirmModal from "../../../Components/ConfirmModal/ConfirmModal";
import Modal from "../../../Components/Modal/Modal";
import { runForLocations, type BulkResult } from "../bulkRun";
import { getRequestErrorMessage, importMenu } from "../deliveryRequests.api";
import type { RequestLocation } from "../deliveryRequests.types";
import BulkProgress from "./BulkProgress";
import { initialScope, scopeGuids, type LocationScope } from "../locationScope";
import LocationScopePicker from "./LocationScopePicker";
import styles from "../DeliveryRequests.module.css";

export type ImportKind = "menu" | "stopList";

/** Тип операции задаётся кнопкой, пользователь его не вводит. */
const IMPORT_KINDS: Record<ImportKind, { operationType: string; title: string; subject: string }> = {
  menu: { operationType: "menu", title: "Импорт меню", subject: "меню" },
  stopList: { operationType: "menu_stop_list", title: "Импорт стоп-листов", subject: "стоп-листов" },
};

type MenuImportModalProps = {
  isOpen: boolean;
  kind: ImportKind;
  locations: RequestLocation[];
  current: RequestLocation | null;
  onClose: () => void;
};

/** Запуск импорта меню или стоп-листов в Яндекс для одной, нескольких или всех точек. */
export default function MenuImportModal({ isOpen, kind, locations, current, onClose }: MenuImportModalProps) {
  const { operationType, title, subject } = IMPORT_KINDS[kind];
  const [scope, setScope] = useState<LocationScope>(() => initialScope(current));
  const [submitted, setSubmitted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<BulkResult<unknown>[] | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setScope(initialScope(current));
    setSubmitted(false);
    setResults(null);
  }, [current, isOpen]);

  const guids = scopeGuids(scope, locations, current);
  const scopeError = guids.length > 0 ? "" : "Выберите хотя бы одну точку.";
  const locked = running || results !== null;

  const run = async (targets: string[]) => {
    setConfirmOpen(false);
    setRunning(true);
    setTotal(targets.length);
    setResults([]);
    await runForLocations(
      targets,
      (locationGuid) => importMenu({ locationGuid, operationType }),
      (reason) => getRequestErrorMessage(reason, `Не удалось запустить импорт ${subject}.`),
      setResults,
    );
    setRunning(false);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (scopeError || locked) return;
    // Для одной точки импорт безопасен и запускается сразу; для многих — после подтверждения.
    if (guids.length === 1) void run(guids);
    else setConfirmOpen(true);
  };

  const failedGuids = (results ?? []).filter((result) => !result.ok).map((result) => result.guid);
  const singleResponse = results?.length === 1 && results[0].ok ? results[0].data : null;

  return (
    <>
      <Modal isOpen={isOpen} onClose={running ? () => undefined : onClose} title={title} size="md">
        <form className={styles.modalForm} onSubmit={submit} noValidate>
          <LocationScopePicker
            locations={locations}
            current={current}
            value={scope}
            onChange={setScope}
            disabled={locked}
            error={submitted ? scopeError : ""}
          />

          {results !== null ? (
            <BulkProgress total={total} results={results} locations={locations} running={running} successText="Запущено" />
          ) : null}
          {singleResponse !== null ? <pre className={styles.raw}>{JSON.stringify(singleResponse, null, 2)}</pre> : null}

          <div className={styles.modalActions}>
            {results !== null && !running ? (
              <>
                {failedGuids.length > 0 ? (
                  <Button variant="secondary" onClick={() => void run(failedGuids)}>Повторить для ошибок ({failedGuids.length})</Button>
                ) : null}
                <Button variant="primary" onClick={onClose}>Готово</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={onClose} disabled={running}>Отмена</Button>
                <Button type="submit" variant="primary" loading={running}>
                  {guids.length > 1 ? `Запустить импорт (${guids.length})` : "Запустить импорт"}
                </Button>
              </>
            )}
          </div>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={confirmOpen}
        title={`Запустить импорт ${subject}?`}
        message={`Импорт ${subject} будет запущен для ${guids.length} точек.`}
        confirmLabel="Запустить"
        cancelLabel="Отмена"
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void run(guids)}
      />
    </>
  );
}
