import { useEffect, useState, type FormEvent } from "react";
import Button from "../../../Components/Button/Button";
import Input from "../../../Components/Input/Input";
import Modal from "../../../Components/Modal/Modal";
import Textarea from "../../../Components/Textarea/Textarea";
import { runForLocations, type BulkResult } from "../bulkRun";
import { blockRestaurant, getRequestErrorMessage } from "../deliveryRequests.api";
import type { RequestLocation } from "../deliveryRequests.types";
import { toIsoSeconds, toLocalInput } from "../deliveryRequests.utils";
import BulkProgress from "./BulkProgress";
import { initialScope, scopeGuids, type LocationScope } from "../locationScope";
import LocationScopePicker from "./LocationScopePicker";
import styles from "../DeliveryRequests.module.css";

type BlockModalProps = {
  isOpen: boolean;
  locations: RequestLocation[];
  /** Точка, открытая на странице; по умолчанию блокируем её. */
  current: RequestLocation | null;
  onClose: () => void;
  /** Вызывается после отправки: сколько точек заблокировано и была ли среди них текущая. */
  onBlocked: (succeeded: string[]) => void;
};

type BlockForm = { from: string; to: string; message: string };

const emptyForm = (): BlockForm => ({ from: toLocalInput(new Date()), to: "", message: "" });


/** Блокировка одной, нескольких или всех точек в Яндекс.Еде: форма, подтверждение и ход выполнения. */
export default function BlockModal({ isOpen, locations, current, onClose, onBlocked }: BlockModalProps) {
  const [form, setForm] = useState<BlockForm>(emptyForm);
  const [scope, setScope] = useState<LocationScope>(() => initialScope(current));
  const [submitted, setSubmitted] = useState(false);
  const [running, setRunning] = useState(false);
  const [total, setTotal] = useState(0);
  const [results, setResults] = useState<BulkResult<unknown>[] | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setForm(emptyForm());
    setScope(initialScope(current));
    setSubmitted(false);
    setResults(null);
  }, [current, isOpen]);

  const guids = scopeGuids(scope, locations, current);
  const errors = {
    from: form.from ? "" : "Укажите начало блокировки.",
    to: form.to && form.from && form.to < form.from ? "Окончание раньше начала." : "",
    message: form.message.trim() ? "" : "Укажите причину блокировки.",
    scope: guids.length > 0 ? "" : "Выберите хотя бы одну точку.",
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const show = (field: keyof typeof errors) => (submitted ? errors[field] : "");
  const locked = running || results !== null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (hasErrors || locked) return;
    void send(guids);
  };

  const send = async (targets: string[]) => {
    setRunning(true);
    setTotal(targets.length);
    setResults([]);
    const payload = {
      from: toIsoSeconds(form.from),
      to: form.to ? toIsoSeconds(form.to) : null,
      message: form.message.trim(),
    };
    const done = await runForLocations(
      targets,
      (locationGuid) => blockRestaurant({ ...payload, locationGuid }),
      (reason) => getRequestErrorMessage(reason, "Не удалось заблокировать точку."),
      setResults,
    );
    setRunning(false);

    const succeeded = done.filter((result) => result.ok).map((result) => result.guid);
    // Без ошибок окно закрываем сразу; с ошибками оставляем, чтобы было видно, какие точки не прошли.
    if (succeeded.length === done.length) onBlocked(succeeded);
  };

  const failedGuids = (results ?? []).filter((result) => !result.ok).map((result) => result.guid);
  const closeAfterErrors = () => {
    const succeeded = (results ?? []).filter((result) => result.ok).map((result) => result.guid);
    if (succeeded.length > 0) onBlocked(succeeded);
    else onClose();
  };


  const set = (field: keyof BlockForm) => (value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  return (
    <>
      <Modal isOpen={isOpen} onClose={running ? () => undefined : results ? closeAfterErrors : onClose} title="Новая блокировка" size="md">
        <form className={styles.modalForm} onSubmit={submit} noValidate>
          <LocationScopePicker
            locations={locations}
            current={current}
            value={scope}
            onChange={setScope}
            disabled={locked}
            error={show("scope")}
          />

          <div className={styles.formGrid}>
            <div className={styles.field}>
              <Input label="Начало *" type="datetime-local" value={form.from} onChange={(event) => set("from")(event.target.value)} disabled={locked} />
              {show("from") ? <p className={styles.fieldError}>{show("from")}</p> : null}
            </div>
            <div className={styles.field}>
              <Input label="Окончание" type="datetime-local" value={form.to} onChange={(event) => set("to")(event.target.value)} disabled={locked} />
              {show("to") ? <p className={styles.fieldError}>{show("to")}</p> : null}
            </div>
            <div className={`${styles.field} ${styles.wide}`}>
              <Textarea label="Причина *" value={form.message} onChange={(event) => set("message")(event.target.value)} maxLength={1000} rows={3} disabled={locked} />
              {show("message") ? <p className={styles.fieldError}>{show("message")}</p> : null}
            </div>
          </div>

          {results !== null ? (
            <BulkProgress total={total} results={results} locations={locations} running={running} successText="Заблокировано" />
          ) : null}

          <div className={styles.modalActions}>
            {results !== null && !running ? (
              <>
                {failedGuids.length > 0 ? (
                  <Button variant="secondary" onClick={() => void send(failedGuids)}>Повторить для ошибок ({failedGuids.length})</Button>
                ) : null}
                <Button variant="primary" onClick={closeAfterErrors}>Закрыть</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" onClick={onClose} disabled={running}>Отмена</Button>
                <Button type="submit" variant="danger" loading={running}>
                  {guids.length > 1 ? `Заблокировать (${guids.length})` : "Заблокировать"}
                </Button>
              </>
            )}
          </div>
        </form>
      </Modal>

    </>
  );
}
