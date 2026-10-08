import { useState } from "react";
import Button from "../../../../Components/Button/Button";
import Checkbox from "../../../../Components/Checkbox/Checkbox";
import Input from "../../../../Components/Input/Input";
import Modal from "../../../../Components/Modal/Modal";
import Select from "../../../../Components/Select/Select";
import Toggle from "../../../../Components/Toggle/Toggle";
import { getOrdersErrorMessage, saveGroup, saveItem, type Actor } from "../../orders.api";
import { formatPrice } from "../../orders.format";
import { DEFAULT_MAX_STEPS } from "../../orders.rules";
import type { CatalogGroup, CatalogItem } from "../../orders.types";
import styles from "../../OrdersSettings.module.css";

const toNumber = (value: string) => (value.trim() === "" ? Number.NaN : Number(value.replace(",", ".")));

interface GroupModalProps {
  group: CatalogGroup;
  actor: Actor;
  onClose: () => void;
  onSaved: (group: CatalogGroup) => void;
}

export function GroupModal({ group, actor, onClose, onSaved }: GroupModalProps) {
  const [name, setName] = useState(group.name);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError("Укажите название группы.");
    setSaving(true);
    try {
      onSaved(await saveGroup({ ...group, name }, actor));
    } catch (reason) {
      setError(getOrdersErrorMessage(reason, "Не удалось сохранить группу."));
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Modal isOpen onClose={() => !saving && onClose()} size="sm" title={group.id ? "Группа каталога" : "Новая группа"} bodyClassName={styles.modalBody}>
      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        <div className={styles.formScroll}>
          <Input label="Название" value={name} maxLength={60} required onChange={(event) => { setName(event.target.value); setError(""); }} />
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

interface ItemModalProps {
  item: CatalogItem;
  groups: CatalogGroup[];
  actor: Actor;
  onClose: () => void;
  onSaved: (item: CatalogItem) => void;
}

export function ItemModal({ item, groups, actor, onClose, onSaved }: ItemModalProps) {
  const [draft, setDraft] = useState(item);
  const [step, setStep] = useState(String(item.step));
  const [max, setMax] = useState(item.maxQuantity === null ? "" : String(item.maxQuantity));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<CatalogItem>) => { setDraft((prev) => ({ ...prev, ...patch })); setError(""); };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const stepValue = toNumber(step);
    const maxValue = max.trim() === "" ? null : toNumber(max);
    if (!draft.article.trim()) return setError("Укажите артикул.");
    if (!draft.name.trim()) return setError("Укажите наименование.");
    if (!groups.some((group) => group.id === draft.groupId)) return setError("Выберите группу.");
    if (!(stepValue > 0)) return setError("Кратность должна быть больше нуля.");
    if (maxValue !== null && !(maxValue >= stepValue)) return setError("Максимум не может быть меньше кратности.");
    if (!draft.forOwn && !draft.forPartner && draft.isActive) return setError("Отметьте, каким торговым точкам доступна позиция, или выключите её.");
    setSaving(true);
    try {
      onSaved(await saveItem({ ...draft, step: stepValue, maxQuantity: maxValue }, actor));
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
            <Input label="Артикул" value={draft.article} maxLength={20} required onChange={(event) => set({ article: event.target.value })} />
            <Select
              label="Группа"
              placeholder="Выберите группу"
              options={groups.map((group) => ({ value: String(group.id), label: group.name }))}
              value={draft.groupId ? String(draft.groupId) : ""}
              search={groups.length > 10}
              onChange={(event) => set({ groupId: Number(event.target.value) })}
            />
            <Input label="Кратность (мин. заказ)" inputMode="decimal" value={step} onChange={(event) => { setStep(event.target.value); setError(""); }} />
            <div>
              <Input label="Максимум в заказе" inputMode="decimal" value={max} placeholder="Общий лимит" onChange={(event) => { setMax(event.target.value); setError(""); }} />
              <p className={styles.hint}>Пусто — до {DEFAULT_MAX_STEPS} упаковок.</p>
            </div>
          </div>

          <div className={styles.toggles}>
            <Toggle label="Доступна для заказа" checked={draft.isActive} onChange={(checked) => set({ isActive: checked })} />
            <div className={styles.checks}>
              <Checkbox label="Собственные ТТ" checked={draft.forOwn} onChange={(event) => set({ forOwn: event.target.checked })} />
              <Checkbox label="Партнёрские ТТ" checked={draft.forPartner} onChange={(event) => set({ forPartner: event.target.checked })} />
            </div>
          </div>

          {item.id && item.price !== null ? (
            <p className={styles.hint}>Последняя цена отгрузки: {formatPrice(item.price)}. Цена подтягивается из 1С автоматически.</p>
          ) : null}
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
