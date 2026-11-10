import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import Button from "../../../Components/Button/Button";
import Input from "../../../Components/Input/Input";
import Modal from "../../../Components/Modal/Modal";
import Select from "../../../Components/Select/Select";
import { toInputDate, validateCode, validateDate } from "../ttEditUtils";
import { formatDate } from "../ttUtils";
import styles from "../TTEdit.module.css";

export type LookupItem = { guid: string; name: string };

/** Версия реквизитов локации: код OBD (только у ТТ) и юрлицо на период. */
export type Requisite = {
  id: number;
  obd: number | null;
  entityGuid: string | null;
  entityName: string | null;
  begin: string;
  end: string | null;
};

/** Новая версия, ещё не сохранённая вместе с локацией. */
export type RequisiteDraft = { obd: number | null; entityGuid: string; begin: string };

export type RequisitesDialog = "edit" | "history" | null;

const today = () => new Date().toLocaleDateString("sv-SE");

/** Версия, действующая сегодня; если все впереди — самая поздняя. */
export function currentRequisite(versions: Requisite[]) {
  const date = today();
  return (
    versions.find((version) => toInputDate(version.begin) <= date && (!version.end || toInputDate(version.end) > date))
    ?? versions[0]
  );
}

const period = (begin: string, end: string | null) =>
  `с ${formatDate(begin)} ${end ? `по ${formatDate(end)}` : "по сей день"}`;

type FieldProps = {
  label: string;
  value: string;
  hint?: string;
  draft: boolean;
  disabled?: boolean;
  historyDisabled?: boolean;
  onEdit: () => void;
  onHistory: () => void;
  onUndo: () => void;
};

/** Поле реквизита только для чтения: смена и история — иконками внутри поля. */
export function RequisiteField({ label, value, hint, draft, disabled, historyDisabled, onEdit, onHistory, onUndo }: FieldProps) {
  return (
    <div className={styles.field}>
      <Input
        label={label}
        readOnly
        disabled
        value={value}
        title={value}
        endAdornment={
          <>
            {draft && (
              <button type="button" className={styles.iconAction} title="Отменить смену" aria-label={`Отменить смену: ${label}`} disabled={disabled} onClick={onUndo}>
                <UndoRoundedIcon />
              </button>
            )}
            <button type="button" className={styles.iconAction} title="Новая версия" aria-label={`Сменить: ${label}`} disabled={disabled} onClick={onEdit}>
              <EditOutlinedIcon />
            </button>
            <button type="button" className={styles.iconAction} title="История" aria-label={`История: ${label}`} disabled={historyDisabled} onClick={onHistory}>
              <HistoryRoundedIcon />
            </button>
          </>
        }
      />
      {hint && <span className={styles.hint} data-pending={draft || undefined}>{hint}</span>}
    </div>
  );
}

/** Подпись под полем: с какого числа действует текущая или новая версия. */
export function requisiteHint(versions: Requisite[], draft: RequisiteDraft | null) {
  const current = currentRequisite(versions);
  if (draft) return `новое с ${formatDate(draft.begin)}`;
  return current ? `с ${formatDate(current.begin)}` : "не задано";
}

type DialogsProps = {
  open: RequisitesDialog;
  onClose: () => void;
  withObd: boolean;
  versions: Requisite[];
  entities: LookupItem[];
  draft: RequisiteDraft | null;
  onApply: (draft: RequisiteDraft) => void;
};

export function RequisitesDialogs({ open, onClose, withObd, versions, entities, draft, onApply }: DialogsProps) {
  const [code, setCode] = useState("");
  const [entityGuid, setEntityGuid] = useState("");
  const [begin, setBegin] = useState("");
  const [errors, setErrors] = useState<{ code?: string; entity?: string; begin?: string; same?: string }>({});
  const firstRef = useRef<HTMLInputElement | null>(null);
  const current = currentRequisite(versions);
  const latest = versions[0];
  const lastBegin = versions.reduce((value, version) => {
    const next = toInputDate(version.begin);
    return next > value ? next : value;
  }, "");
  const entityName = (guid: string | null) => entities.find((item) => item.guid === guid)?.name ?? "—";

  useEffect(() => {
    if (open !== "edit") return undefined;
    setCode((draft ? draft.obd : latest?.obd)?.toString() ?? "");
    setEntityGuid(draft?.entityGuid ?? latest?.entityGuid ?? "");
    setBegin(draft?.begin ?? "");
    setErrors({});
    // Modal сам переводит фокус на панель в следующем кадре — ставим курсор в первое поле после него.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => firstRef.current?.focus());
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [open, draft, latest]);

  const apply = () => {
    const codeValid = validateCode(code);
    const next = {
      code: !withObd
        ? undefined
        : !code.trim()
          ? "Укажите код OBD"
          : codeValid !== true
            ? codeValid
            : Number(code) > 0
              ? undefined
              : "Код должен быть больше нуля",
      entity: entityGuid ? undefined : "Выберите юридическое лицо",
      begin: !begin
        ? "Укажите дату начала"
        : validateDate(begin) !== true
          ? String(validateDate(begin))
          : lastBegin && begin <= lastBegin
            ? `Позже ${formatDate(lastBegin)}`
            : undefined,
      same:
        latest && (!withObd || Number(code) === latest.obd) && entityGuid === latest.entityGuid
          ? "Измените код OBD или юридическое лицо"
          : undefined,
    };
    setErrors(next);
    if (next.code || next.entity || next.begin || next.same) return;
    onApply({ obd: withObd ? Number(code) : null, entityGuid, begin });
    onClose();
  };

  const applyOnEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      apply();
    }
  };

  return (
    <>
      <Modal isOpen={open === "edit"} onClose={onClose} title="Новая версия" size="sm">
        <div className={styles.requisitesDialog}>
          {withObd && (
            <div className={styles.field}>
              <Input
                label="Код OBD *"
                ref={firstRef}
                inputMode="numeric"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                onKeyDown={applyOnEnter}
                aria-invalid={!!errors.code}
              />
              {errors.code && <span className={styles.fieldError} role="alert">{errors.code}</span>}
            </div>
          )}
          <div className={styles.field}>
            <Select
              label="Юридическое лицо *"
              value={entityGuid}
              options={entities.map((item) => ({ value: item.guid, label: item.name }))}
              placeholder="Выберите организацию"
              search
              onChange={(event) => setEntityGuid(event.target.value)}
              aria-invalid={!!errors.entity}
            />
            {errors.entity && <span className={styles.fieldError} role="alert">{errors.entity}</span>}
          </div>
          <div className={styles.field}>
            <Input
              label="Действует с *"
              ref={withObd ? undefined : firstRef}
              type="date"
              min={lastBegin || "1753-01-01"}
              max="9999-12-31"
              value={begin}
              onChange={(event) => setBegin(event.target.value)}
              onKeyDown={applyOnEnter}
              aria-invalid={!!errors.begin}
            />
            {errors.begin && <span className={styles.fieldError} role="alert">{errors.begin}</span>}
          </div>
          {errors.same && <span className={styles.fieldError} role="alert">{errors.same}</span>}
          <div className={styles.requisitesDialogActions}>
            <Button variant="secondary" onClick={onClose}>Отмена</Button>
            <Button variant="primary" onClick={apply}>Применить</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={open === "history"} onClose={onClose} title="История" size="md" closeOnBackdropClick>
        <ul className={styles.requisitesHistory}>
          {draft && (
            <li data-pending>
              {withObd && <strong>{draft.obd}</strong>}
              <span className={styles.historyEntity} title={entityName(draft.entityGuid)}>{entityName(draft.entityGuid)}</span>
              <span>{period(draft.begin, null)} · не сохранено</span>
            </li>
          )}
          {versions.map((version) => (
            <li key={version.id} data-current={version === current && !draft ? true : undefined}>
              {withObd && <strong>{version.obd ?? "—"}</strong>}
              <span className={styles.historyEntity} title={version.entityName ?? undefined}>{version.entityName ?? "—"}</span>
              <span>{period(version.begin, draft && !version.end ? draft.begin : version.end)}</span>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
