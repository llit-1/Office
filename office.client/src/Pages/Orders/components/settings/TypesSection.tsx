import { useState } from "react";
import { useNotifications } from "@toolpad/core";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import EventAvailableOutlinedIcon from "@mui/icons-material/EventAvailableOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import Button from "../../../../Components/Button/Button";
import ConfirmModal from "../../../../Components/ConfirmModal/ConfirmModal";
import Input from "../../../../Components/Input/Input";
import Modal from "../../../../Components/Modal/Modal";
import StatusBadge from "../../../../Components/StatusBadge/StatusBadge";
import Toggle from "../../../../Components/Toggle/Toggle";
import { getOrdersErrorMessage, resetDemoData, saveOrderType, type Actor } from "../../orders.api";
import { formatDelivery, formatMoment } from "../../orders.format";
import { anchorWeekday, cronError, resolveSlot } from "../../orders.rules";
import type { OrderTypeConfig } from "../../orders.types";
import type { SettingsSectionProps } from "../../OrdersSettingsPage";
import { useNow } from "../../useOrdersBase";
import shared from "../../Orders.module.css";
import styles from "../../OrdersSettings.module.css";

const emptyType = (): OrderTypeConfig => ({ id: 0, name: "", isActive: true, closeCron: "0 12 * * *", deliveryCron: "0 0 * * *", offsetDays: 1 });

/** Что получится, если оформить заказ прямо сейчас, — понятнее, чем само крон-выражение. */
function describeNow(type: OrderTypeConfig, now: Date) {
  const slot = resolveSlot(type, null, now);
  if (!slot) return "Расписание задано с ошибкой — заказ оформить не получится.";
  const date = formatDelivery(slot.deliveryDate, now).date;
  // якорь-понедельник — это неделя доставки: точный день у каждой ТТ свой
  const delivery = anchorWeekday(type) !== null ? `доставка с ${date}, день недели — по торговой точке` : `доставка ${date}`;
  return `Заказ, оформленный сейчас: приём до ${formatMoment(slot.closeAt)}, ${delivery}.`;
}

export default function TypesSection({ base, actor, onBaseChange }: SettingsSectionProps) {
  const notifications = useNotifications();
  const now = useNow(60_000);
  const [editing, setEditing] = useState<OrderTypeConfig | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [resetOpen, setResetOpen] = useState(false);

  const toggle = async (type: OrderTypeConfig, isActive: boolean) => {
    setBusyId(type.id);
    try {
      await saveOrderType({ ...type, isActive }, actor);
      await onBaseChange();
      notifications.show(`«${type.name}»: вкладка ${isActive ? "включена" : "отключена"}`, { severity: "success", autoHideDuration: 2500 });
    } catch (reason) {
      notifications.show(getOrdersErrorMessage(reason, "Не удалось изменить вкладку."), { severity: "error", autoHideDuration: 5000 });
    } finally {
      setBusyId(null);
    }
  };

  const reset = async () => {
    setResetOpen(false);
    try {
      await resetDemoData(actor);
      await onBaseChange();
      notifications.show("Демо-данные восстановлены", { severity: "success", autoHideDuration: 2500 });
    } catch (reason) {
      notifications.show(getOrdersErrorMessage(reason, "Не удалось сбросить демо-данные."), { severity: "error", autoHideDuration: 5000 });
    }
  };

  return (
    <div className={styles.stack}>
      <section className={shared.panel}>
        <header className={shared.panelHeader}>
          <div className={shared.panelHeading}>
            <h2 className={shared.panelTitle}>Вкладки заказов</h2>
            <p className={shared.panelSubtitle}>У каждой вкладки два расписания: когда закрывается приём и когда возят.</p>
          </div>
          <Button variant="primary" leadingIcon={<AddRoundedIcon />} onClick={() => setEditing(emptyType())}>Добавить вкладку</Button>
        </header>
        <ul className={styles.typeList}>
          {base.types.map((type) => (
            <li key={type.id} className={styles.typeRow}>
              <div className={styles.typeInfo}>
                <div className={styles.typeName}>
                  <strong>{type.name}</strong>
                  {!type.isActive ? <StatusBadge tone="warning">Отключена</StatusBadge> : null}
                </div>
                <p>{describeNow(type, now)}</p>
                <p className={styles.cron}>
                  приём <code>{type.closeCron}</code> · доставка <code>{type.deliveryCron}</code> · сдвиг {type.offsetDays} дн.
                </p>
              </div>
              <div className={styles.typeActions}>
                <Toggle small ariaLabel={`${type.name}: приём заказов`} checked={type.isActive} disabled={busyId === type.id} onChange={(checked) => void toggle(type, checked)} />
                <button type="button" className={`${shared.iconButton} ${shared.iconButtonOutlined}`} aria-label={`Изменить «${type.name}»`} title="Изменить" onClick={() => setEditing(type)}>
                  <EditRoundedIcon />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className={`${shared.notice} ${styles.demo}`}>
        <InfoOutlinedIcon aria-hidden="true" />
        <div className={shared.noticeBody}>
          <span>Раздел работает на демонстрационных данных: заказы и настройки хранятся в этом браузере и не уходят на сервер.</span>
          <button type="button" className={shared.linkButton} onClick={() => setResetOpen(true)}>Вернуть исходные демо-данные</button>
        </div>
      </section>

      {editing ? (
        <TypeModal
          key={editing.id}
          type={editing}
          actor={actor}
          onClose={() => setEditing(null)}
          onSaved={async (saved) => {
            setEditing(null);
            await onBaseChange();
            notifications.show(`«${saved.name}»: настройки сохранены`, { severity: "success", autoHideDuration: 2500 });
          }}
        />
      ) : null}
      <ConfirmModal
        isOpen={resetOpen}
        title="Сбросить демо-данные?"
        message="Все заказы и настройки, изменённые в этом браузере, вернутся к исходному состоянию."
        confirmLabel="Сбросить"
        cancelLabel="Отмена"
        onCancel={() => setResetOpen(false)}
        onConfirm={() => void reset()}
      />
    </div>
  );
}

interface TypeModalProps {
  type: OrderTypeConfig;
  actor: Actor;
  onClose: () => void;
  onSaved: (type: OrderTypeConfig) => void | Promise<void>;
}

function TypeModal({ type, actor, onClose, onSaved }: TypeModalProps) {
  const now = useNow(60_000);
  const [draft, setDraft] = useState(type);
  const [offset, setOffset] = useState(String(type.offsetDays));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof OrderTypeConfig>(key: K, value: OrderTypeConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  const offsetDays = offset.trim() === "" ? Number.NaN : Number(offset);
  const cronProblem = cronError(draft.closeCron) ?? cronError(draft.deliveryCron);
  const offsetProblem = Number.isInteger(offsetDays) && offsetDays >= 0 ? "" : "Сдвиг — целое число дней, не меньше нуля.";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = !draft.name.trim() ? "Укажите название вкладки." : cronProblem ?? offsetProblem;
    if (problem) return setError(problem);
    setSaving(true);
    try {
      await onSaved(await saveOrderType({ ...draft, offsetDays }, actor));
    } catch (reason) {
      setError(getOrdersErrorMessage(reason, "Не удалось сохранить вкладку."));
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Modal isOpen onClose={() => !saving && onClose()} size="md" title={type.id ? draft.name || "Вкладка" : "Новая вкладка"} bodyClassName={styles.modalBody}>
      <form className={styles.form} onSubmit={(event) => void submit(event)} noValidate>
        <div className={styles.formScroll}>
          <div className={styles.formGrid}>
            <Input label="Название" wrapperClassName={styles.formWide} value={draft.name} maxLength={60} required
              placeholder="Например, Регулярный (Завтра)" onChange={(event) => set("name", event.target.value)} />
            <div>
              <Input label="Приём закрывается (крон)" className={styles.mono} value={draft.closeCron} maxLength={40} spellCheck={false}
                onChange={(event) => set("closeCron", event.target.value)} />
              <p className={styles.hint}>«0 12 * * *» — каждый день в 12:00, «0 0 * * 1» — с концом недели.</p>
            </div>
            <div>
              <Input label="День-якорь доставки (крон)" className={styles.mono} value={draft.deliveryCron} maxLength={40} spellCheck={false}
                onChange={(event) => set("deliveryCron", event.target.value)} />
              <p className={styles.hint}>«0 0 * * *» — любой день, «0 0 * * 1» — понедельник, «0 0 L * *» — последний день месяца.</p>
            </div>
            <div className={styles.formWide}>
              <Input label="Сдвиг от якоря, дней" type="number" min={0} inputMode="numeric" value={offset}
                onChange={(event) => { setOffset(event.target.value); setError(""); }} />
              <p className={styles.hint}>На столько дней после якоря везут. Для отдельной ТТ сдвиг задаётся в «Днях доставки».</p>
            </div>
          </div>
          <p className={`${shared.notice} ${cronProblem || offsetProblem ? shared.noticeWarning : ""}`}>
            <EventAvailableOutlinedIcon aria-hidden="true" />
            <span>{cronProblem ?? (offsetProblem || describeNow({ ...draft, offsetDays }, now))}</span>
          </p>
          <Toggle label="Принимать заказы на этой вкладке" checked={draft.isActive} onChange={(checked) => set("isActive", checked)} />
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
