import { useId, useState } from "react";
import Button from "../../../../Components/Button/Button";
import Checkbox from "../../../../Components/Checkbox/Checkbox";
import Input from "../../../../Components/Input/Input";
import Modal from "../../../../Components/Modal/Modal";
import Select from "../../../../Components/Select/Select";
import Toggle from "../../../../Components/Toggle/Toggle";
import { getOrdersErrorMessage, saveItem } from "../../orders.api";
import type { CatalogGroup, CatalogItem } from "../../orders.types";
import styles from "../../OrdersSettings.module.css";

/** Целое число из поля ввода; пустая строка и нечисло — NaN. */
const toInteger = (value: string) => (/^\d+$/.test(value.trim()) ? Number(value.trim()) : Number.NaN);
/** Число из поля ввода, дробная часть — через запятую или точку; пустая строка и нечисло — NaN. */
const toNumber = (value: string) => (/^\d+([.,]\d+)?$/.test(value.trim()) ? Number(value.trim().replace(",", ".")) : Number.NaN);

interface ItemModalProps {
  item: CatalogItem;
  groups: CatalogGroup[];
  onClose: () => void;
  onSaved: (item: CatalogItem) => void;
}

export function ItemModal({ item, groups, onClose, onSaved }: ItemModalProps) {
  const [draft, setDraft] = useState(item);
  const [rkcode, setRkcode] = useState(item.rkcode === null ? "" : String(item.rkcode));
  const [step, setStep] = useState(String(item.step).replace(".", ","));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const accessId = useId();
  const set = (patch: Partial<CatalogItem>) => { setDraft((prev) => ({ ...prev, ...patch })); setError(""); };
  const edit = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLInputElement>) => { setter(event.target.value); setError(""); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const rkcodeValue = rkcode.trim() === "" ? null : toInteger(rkcode);
    const stepValue = toNumber(step);
    if (!draft.name.trim()) return setError("Укажите наименование.");
    if (!groups.some((group) => group.id === draft.groupId)) return setError("Выберите группу.");
    if (rkcodeValue !== null && !(rkcodeValue > 0)) return setError("Код R-Keeper — целое число больше нуля или пусто.");
    if (!(stepValue > 0)) return setError("Кратность — число больше нуля, например 6 или 12,5: столько позиция заказывается за раз.");
    if (!draft.forOwn && !draft.forPartner && draft.isActive) return setError("Отметьте, каким торговым точкам доступна позиция, или выключите её.");
    setSaving(true);
    try {
      onSaved(await saveItem({ ...draft, name: draft.name.trim(), rkcode: rkcodeValue, step: stepValue }));
    } catch (reason) {
      setError(getOrdersErrorMessage(reason, "Не удалось сохранить позицию."));
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Modal isOpen onClose={() => !saving && onClose()} size="md" title={item.id ? "Позиция каталога" : "Новая позиция"} bodyClassName={styles.modalBody}>
      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        <div className={styles.formScroll}>
          <div className={styles.formGrid}>
            <Input label="Наименование" wrapperClassName={styles.formWide} value={draft.name} maxLength={200} required onChange={(event) => set({ name: event.target.value })} />
            <Select
              label="Группа"
              placeholder="Выберите группу"
              wrapperClassName={styles.formWide}
              options={groups.map((group) => ({ value: String(group.id), label: group.name }))}
              value={draft.groupId ? String(draft.groupId) : ""}
              search={groups.length > 10}
              onChange={(event) => set({ groupId: Number(event.target.value) })}
            />
            <Input label="Код R-Keeper" inputMode="numeric" value={rkcode} onChange={edit(setRkcode)} />
            <Input label="Кратность" inputMode="decimal" value={step} onChange={edit(setStep)} />
          </div>

          {/* одна рамка: общий выключатель и под ним — кому позиция доступна */}
          <fieldset className={styles.access}>
            <legend className={styles.accessLegend}>Доступность</legend>
            <div className={styles.accessRow}>
              <label htmlFor={accessId}>Доступна для заказа</label>
              <Toggle id={accessId} checked={draft.isActive} onChange={(checked) => set({ isActive: checked })} />
            </div>
            <div className={styles.accessStores}>
              <Checkbox label="Собственные ТТ" checked={draft.forOwn} onChange={(event) => set({ forOwn: event.target.checked })} />
              <Checkbox label="Партнёрские ТТ" checked={draft.forPartner} onChange={(event) => set({ forPartner: event.target.checked })} />
            </div>
          </fieldset>
        </div>
        <div className={styles.formBar}>
          {error ? <p className={styles.formError} role="alert">{error}</p> : null}
          <Button variant="secondary" onClick={onClose} disabled={saving}>Отмена</Button>
          <Button type="submit" variant="primary" loading={saving}>Сохранить</Button>
        </div>
      </form>
    </Modal>
  );
}
