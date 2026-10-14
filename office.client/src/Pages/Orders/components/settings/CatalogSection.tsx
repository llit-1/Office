import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNotifications } from "@toolpad/core";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Button from "../../../../Components/Button/Button";
import Checkbox from "../../../../Components/Checkbox/Checkbox";
import LoadingSpinner from "../../../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../../../Components/Select/Select";
import StatePanel from "../../../../Components/StatePanel/StatePanel";
import Toggle from "../../../../Components/Toggle/Toggle";
import { getCatalog, getOrdersErrorMessage, saveItem } from "../../orders.api";
import { formatQuantity } from "../../orders.format";
import type { CatalogItem, OrderRule, OrdersBootstrap } from "../../orders.types";
import { useLoader } from "../../useOrdersBase";
import { ItemModal } from "./CatalogModals";
import shared from "../../Orders.module.css";
import styles from "../../OrdersSettings.module.css";

const PAGE_SIZE = 100;

const stateOptions = [
  { value: "all", label: "Все позиции" },
  { value: "on", label: "Только включённые" },
  { value: "off", label: "Только выключенные" },
];

export default function CatalogSection({ base }: { base: OrdersBootstrap }) {
  const [ruleId, setRuleId] = useState(base.rules[0]?.id ?? 0);
  const rule = base.rules.find((candidate) => candidate.id === ruleId);

  if (!rule) {
    return (
      <section className={shared.panel}>
        <StatePanel icon={<Inventory2OutlinedIcon />} title="Типов заказов нет" text="Каталог ведётся отдельно для каждого типа заказа." />
      </section>
    );
  }

  return (
    <CatalogEditor key={rule.id} rule={rule} ruleSwitch={(
      <Select
        label="Тип заказа"
        hideLabel
        wrapperClassName={`${shared.compactField} ${styles.typeSwitch}`}
        options={base.rules.map((candidate) => ({ value: String(candidate.id), label: candidate.name }))}
        value={String(ruleId)}
        onChange={(event) => setRuleId(Number(event.target.value))}
      />
    )} />
  );
}

function CatalogEditor({ rule, ruleSwitch }: { rule: OrderRule; ruleSwitch: React.ReactNode }) {
  const notifications = useNotifications();
  const loadCatalog = useCallback(() => getCatalog(rule.id), [rule.id]);
  const { data: catalog, error, reload } = useLoader(loadCatalog);
  const [groupId, setGroupId] = useState(0);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [state, setState] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [itemModal, setItemModal] = useState<CatalogItem | null>(null);

  useEffect(() => { setLimit(PAGE_SIZE); }, [groupId, deferredQuery, state]);

  const run = useCallback(async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      if (success) notifications.show(success, { severity: "success", autoHideDuration: 2500 });
    } catch (reason) {
      notifications.show(getOrdersErrorMessage(reason, "Не удалось сохранить изменения."), { severity: "error", autoHideDuration: 5000 });
    }
    // и после ошибки перечитываем: часть позиций могла сохраниться
    await reload();
  }, [notifications, reload]);

  // группы приходят вместе со своими позициями
  const groups = useMemo(() => catalog ?? [], [catalog]);
  const items = useMemo(
    () => groups.flatMap((group) => group.items).sort((left, right) => left.name.localeCompare(right.name, "ru")),
    [groups],
  );
  const groupNameById = useMemo(() => new Map(groups.map((group) => [group.id, group.name])), [groups]);

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("ru-RU");
    return items.filter((item) =>
      (groupId === 0 || item.groupId === groupId)
      && (state === "all" || (state === "on") === item.isActive)
      && (!needle || `${item.name} ${item.rkcode ?? ""}`.toLocaleLowerCase("ru-RU").includes(needle)));
  }, [deferredQuery, groupId, items, state]);

  if (!catalog) {
    return (
      <section className={shared.panel}>
        <header className={shared.panelHeader}>{ruleSwitch}</header>
        {error ? (
          <StatePanel tone="error" icon={<ErrorOutlineRoundedIcon />} title="Каталог не загрузился" text="Проверьте соединение и повторите попытку."
            action={<Button variant="primary" onClick={() => void reload()}>Повторить</Button>} />
        ) : <div className={shared.loading}><LoadingSpinner size={56} label="Загружаем каталог…" /></div>}
      </section>
    );
  }

  const selectedItems = visible.filter((item) => selected.has(item.id));
  const allSelected = visible.length > 0 && selectedItems.length === visible.length;

  const toggleSelected = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  // сервер сохраняет позицию целиком, поэтому меняем поле и отправляем её всю
  const patch = (targets: CatalogItem[], change: Partial<Pick<CatalogItem, "isActive" | "forOwn">>, success?: string) =>
    void run(() => Promise.all(targets.map((item) => saveItem({ ...item, ...change }))), success);

  const newItem = (): CatalogItem => ({
    id: 0, ruleId: rule.id, groupId: groupId || groups[0]?.id || 0, rkcode: null, name: "", step: 1,
    isActive: true, forOwn: true,
  });

  return (
    <>
      <section className={`${shared.panel} ${styles.items}`} aria-label="Позиции каталога">
        <div className={styles.itemsToolbar}>
          {ruleSwitch}
          <label className={shared.searchField}>
            <SearchRoundedIcon aria-hidden="true" />
            <span className={shared.srOnly}>Поиск по позициям</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или код" />
          </label>
          <Select label="Состояние" hideLabel wrapperClassName={`${shared.compactField} ${styles.stateFilter}`} options={stateOptions} value={state} onChange={(event) => setState(event.target.value)} />
          <Button variant="primary" leadingIcon={<AddRoundedIcon />} disabled={groups.length === 0} onClick={() => setItemModal(newItem())}>
            Добавить позицию
          </Button>
        </div>

        {/* одна группа — фильтровать нечего */}
        {groups.length > 1 ? (
          <div className={`${shared.chips} ${styles.groupChips}`} role="group" aria-label="Группы каталога">
            <button type="button" className={shared.chip} aria-pressed={groupId === 0} onClick={() => setGroupId(0)}>
              Все группы
              <span className={shared.chipCount}>{items.length}</span>
            </button>
            {groups.map((group) => (
              <button key={group.id} type="button" className={shared.chip} aria-pressed={groupId === group.id} onClick={() => setGroupId(group.id)}>
                {group.name}
                <span className={shared.chipCount}>{group.items.length}</span>
              </button>
            ))}
          </div>
        ) : null}

        {selectedItems.length > 0 ? (
          <div className={styles.bulk} role="region" aria-label="Действия с выбранными позициями">
            <strong>Выбрано: {selectedItems.length}</strong>
            <Button size="sm" onClick={() => patch(selectedItems, { isActive: true }, "Позиции включены")}>Включить</Button>
            <Button size="sm" onClick={() => patch(selectedItems, { isActive: false }, "Позиции выключены")}>Выключить</Button>
            <Button size="sm" variant="ghost" className={styles.pushRight} onClick={() => setSelected(new Set())}>Снять выделение</Button>
          </div>
        ) : null}

        {visible.length === 0 ? (
          <StatePanel
            icon={<Inventory2OutlinedIcon />}
            title={items.length === 0 ? "В каталоге пока нет позиций" : "Позиций не найдено"}
            text={items.length === 0
              ? "Позиции этого типа заказа ещё не заведены."
              : "Измените запрос, фильтр или выберите другую группу."}
          />
        ) : (
          <div className={styles.table} role="table" aria-label="Позиции">
            <div className={styles.tableHead} role="row">
              <span role="columnheader">
                <Checkbox
                  size="sm"
                  label={<span className={shared.srOnly}>Выбрать все позиции в списке</span>}
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(visible.map((item) => item.id)))}
                />
              </span>
              <span role="columnheader">Позиция</span>
              <span role="columnheader" className={styles.colNumber}>Кратность</span>
              <span role="columnheader" className={styles.colCenter} title="Доступна роли «Заказы - Собственное управление»">Собств.</span>
              <span role="columnheader" className={styles.colCenter}>Вкл.</span>
              <span role="columnheader" />
            </div>
            {visible.slice(0, limit).map((item) => (
              <div key={item.id} className={styles.tableRow} role="row" data-off={!item.isActive || undefined}>
                <span role="cell" className={styles.colCheck}>
                  <Checkbox size="sm" label={<span className={shared.srOnly}>Выбрать «{item.name}»</span>} checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} />
                </span>
                <div role="cell" className={styles.colName}>
                  <span>{item.name}</span>
                  <small>{[item.rkcode, groupId === 0 ? groupNameById.get(item.groupId) : ""].filter(Boolean).join(" · ")}</small>
                </div>
                <span role="cell" className={`${styles.colNumber} ${styles.colStep} ${shared.numeric}`} data-label="Кратность">{formatQuantity(item.step)}</span>
                <span role="cell" className={`${styles.colCenter} ${styles.colOwn}`}>
                  <Checkbox size="sm" label={<span className={styles.cellLabel}>Собственные ТТ</span>} checked={item.forOwn}
                    onChange={(event) => patch([item], { forOwn: event.target.checked })} />
                </span>
                <span role="cell" className={`${styles.colCenter} ${styles.colToggle}`}>
                  <Toggle small ariaLabel={`«${item.name}»: доступна для заказа`} checked={item.isActive}
                    onChange={(checked) => patch([item], { isActive: checked })} />
                </span>
                <span role="cell" className={styles.colEdit}>
                  <button type="button" className={shared.iconButton} aria-label={`Изменить «${item.name}»`} title="Изменить" onClick={() => setItemModal(item)}>
                    <EditRoundedIcon />
                  </button>
                </span>
              </div>
            ))}
            {visible.length > limit ? (
              <div className={styles.more}>
                <span className={shared.muted}>Показано {limit} из {visible.length}</span>
                <Button variant="secondary" onClick={() => setLimit((value) => value + PAGE_SIZE)}>Показать ещё</Button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {itemModal ? (
        <ItemModal
          key={`item-${itemModal.id}`}
          item={itemModal}
          groups={groups}
          onClose={() => setItemModal(null)}
          onSaved={(saved) => { setItemModal(null); void run(async () => undefined, `«${saved.name}» сохранена`); }}
        />
      ) : null}
    </>
  );
}
