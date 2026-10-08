import { useMemo, useState } from "react";
import { useNotifications } from "@toolpad/core";
import Select from "../../../../Components/Select/Select";
import { getOrdersErrorMessage, setDeliveryDay } from "../../orders.api";
import { plural, weekdayNames } from "../../orders.format";
import { anchorWeekday } from "../../orders.rules";
import type { SettingsSectionProps } from "../../OrdersSettingsPage";
import shared from "../../Orders.module.css";
import styles from "../../OrdersSettings.module.css";

const DEFAULT = "default";

/** Связка «вкладка + ТТ → сдвиг дня доставки от якоря». */
export default function DeliveryDaysSection({ base, actor, onBaseChange }: SettingsSectionProps) {
  const notifications = useNotifications();
  // по умолчанию — первая вкладка, у которой якорь всегда в один день недели (недельные и месячные)
  const [typeId, setTypeId] = useState(() => (base.types.find((type) => anchorWeekday(type) !== null) ?? base.types[0])?.id ?? 0);
  const [busyStore, setBusyStore] = useState<number | null>(null);
  const type = base.types.find((candidate) => candidate.id === typeId);
  const stores = useMemo(() => base.stores.filter((store) => !store.closed), [base.stores]);
  const offsets = useMemo(
    () => new Map(base.deliveryDays.filter((item) => item.typeId === typeId).map((item) => [item.storeId, item.offsetDays])),
    [base.deliveryDays, typeId],
  );

  if (!type) return null;

  // якорь-понедельник превращает сдвиг в день недели; у остальных вкладок это просто «+N дней»
  const anchor = anchorWeekday(type);
  const label = (offset: number) =>
    anchor !== null ? weekdayNames[(anchor - 1 + offset) % 7] : offset === 0 ? "В день якоря" : `Через ${offset} ${plural(offset, "день", "дня", "дней")}`;
  const options = [
    { value: DEFAULT, label: `Как у вкладки — ${label(type.offsetDays).toLowerCase()}` },
    ...Array.from({ length: 7 }, (_, offset) => ({ value: String(offset), label: label(offset) })),
  ];

  const change = async (storeId: number, value: string) => {
    setBusyStore(storeId);
    try {
      await setDeliveryDay(type.id, storeId, value === DEFAULT ? null : Number(value), actor);
      await onBaseChange();
    } catch (reason) {
      notifications.show(getOrdersErrorMessage(reason, "Не удалось сохранить день доставки."), { severity: "error", autoHideDuration: 5000 });
    } finally {
      setBusyStore(null);
    }
  };

  return (
    <section className={shared.panel}>
      <header className={shared.panelHeader}>
        <div className={shared.panelHeading}>
          <h2 className={shared.panelTitle}>Дни доставки</h2>
          <p className={shared.panelSubtitle}>
            {anchor !== null ? "В какой день недели доставки везут каждой торговой точке." : "На сколько дней от якоря сдвигается доставка для отдельной торговой точки."}
          </p>
        </div>
        <Select
          label="Вкладка"
          wrapperClassName={`${shared.compactField} ${styles.typeSwitch}`}
          options={base.types.map((candidate) => ({ value: String(candidate.id), label: candidate.name }))}
          value={String(typeId)}
          onChange={(event) => setTypeId(Number(event.target.value))}
        />
      </header>
      <ul className={styles.daysList}>
        {stores.map((store) => (
          <li key={store.id} className={styles.daysRow}>
            <span className={styles.daysName}>{store.name}</span>
            <Select
              label={`День доставки: ${store.name}`}
              hideLabel
              wrapperClassName={`${shared.compactField} ${styles.daysSelect}`}
              options={options}
              value={offsets.has(store.id) ? String(offsets.get(store.id)) : DEFAULT}
              disabled={busyStore === store.id}
              onChange={(event) => void change(store.id, event.target.value)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
