import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useNotifications } from "@toolpad/core";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Button from "../../../../Components/Button/Button";
import Checkbox from "../../../../Components/Checkbox/Checkbox";
import ConfirmModal from "../../../../Components/ConfirmModal/ConfirmModal";
import LoadingSpinner from "../../../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../../../Components/Select/Select";
import StatePanel from "../../../../Components/StatePanel/StatePanel";
import Toggle from "../../../../Components/Toggle/Toggle";
import { deleteGroup, deleteItems, getCatalog, getOrdersErrorMessage, patchItems, type Actor } from "../../orders.api";
import { formatPrice, formatQuantity, positionsLabel } from "../../orders.format";
import type { CatalogGroup, CatalogItem, OrderTypeConfig } from "../../orders.types";
import type { SettingsSectionProps } from "../../OrdersSettingsPage";
import { useLoader } from "../../useOrdersBase";
import { GroupModal, ItemModal } from "./CatalogModals";
import shared from "../../Orders.module.css";
import styles from "../../OrdersSettings.module.css";

const PAGE_SIZE = 100;

const stateOptions = [
  { value: "all", label: "Все позиции" },
  { value: "on", label: "Только включённые" },
  { value: "off", label: "Только выключенные" },
];

export default function CatalogSection({ base, actor }: SettingsSectionProps) {
  const [typeId, setTypeId] = useState(base.types[0]?.id ?? 0);
  const type = base.types.find((candidate) => candidate.id === typeId);

  if (!type) {
    return (
      <section className={shared.panel}>
        <StatePanel icon={<Inventory2OutlinedIcon />} title="Сначала добавьте вкладку" text="Каталог ведётся отдельно для каждой вкладки заказов." />
      </section>
    );
  }

  return (
    <CatalogEditor key={type.id} type={type} actor={actor} typeSwitch={(
      <Select
        label="Вкладка"
        wrapperClassName={`${shared.compactField} ${styles.typeSwitch}`}
        options={base.types.map((candidate) => ({ value: String(candidate.id), label: candidate.name }))}
        value={String(typeId)}
        onChange={(event) => setTypeId(Number(event.target.value))}
      />
    )} />
  );
}

interface Confirmation {
  title: string;
  message: string;
  label: string;
  run: () => Promise<unknown>;
}

function CatalogEditor({ type, actor, typeSwitch }: { type: OrderTypeConfig; actor: Actor; typeSwitch: React.ReactNode }) {
  const notifications = useNotifications();
  const loadCatalog = useCallback(() => getCatalog(type.id), [type.id]);
  const { data: catalog, error, reload } = useLoader(loadCatalog);
  const [groupId, setGroupId] = useState(0);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [state, setState] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [groupModal, setGroupModal] = useState<CatalogGroup | null>(null);
  const [itemModal, setItemModal] = useState<CatalogItem | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => { setLimit(PAGE_SIZE); }, [groupId, deferredQuery, state]);

  const run = useCallback(async (action: () => Promise<unknown>, success?: string) => {
    try {
      await action();
      await reload();
      if (success) notifications.show(success, { severity: "success", autoHideDuration: 2500 });
    } catch (reason) {
      notifications.show(getOrdersErrorMessage(reason, "Не удалось сохранить изменения."), { severity: "error", autoHideDuration: 5000 });
    }
  }, [notifications, reload]);

  const groups = useMemo(() => catalog?.groups ?? [], [catalog]);
  const items = useMemo(() => catalog?.items ?? [], [catalog]);
  const groupById = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);
  const counts = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of items) map.set(item.groupId, (map.get(item.groupId) ?? 0) + 1);
    return map;
  }, [items]);
  const hasPrices = useMemo(() => items.some((item) => item.price !== null), [items]);

  const visible = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("ru-RU");
    return items.filter((item) =>
      (groupId === 0 || item.groupId === groupId)
      && (state === "all" || (state === "on") === item.isActive)
      && (!needle || `${item.name} ${item.article}`.toLocaleLowerCase("ru-RU").includes(needle)));
  }, [deferredQuery, groupId, items, state]);

  if (!catalog) {
    return (
      <section className={shared.panel}>
        <header className={shared.panelHeader}>{typeSwitch}</header>
        {error ? (
          <StatePanel tone="error" icon={<ErrorOutlineRoundedIcon />} title="Каталог не загрузился" text="Проверьте соединение и повторите попытку."
            action={<Button variant="primary" onClick={() => void reload()}>Повторить</Button>} />
        ) : <div className={shared.loading}><LoadingSpinner size={56} label="Загружаем каталог…" /></div>}
      </section>
    );
  }

  const activeGroup = groupById.get(groupId);
  const selectedIds = visible.filter((item) => selected.has(item.id)).map((item) => item.id);
  const allSelected = visible.length > 0 && selectedIds.length === visible.length;

  const toggleSelected = (id: number) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const newItem = (): CatalogItem => ({
    id: 0, groupId: groupId || groups[0]?.id || 0, article: "", name: "", step: 1, maxQuantity: null,
    isActive: true, forOwn: true, forPartner: true, price: null,
  });

  return (
    <div className={styles.catalog}>
      <section className={`${shared.panel} ${styles.catalogHead}`}>
        {typeSwitch}
        <p className={shared.panelSubtitle}>
          Групп: {groups.length} · {positionsLabel(items.length)}, включено {items.filter((item) => item.isActive).length}
        </p>
      </section>

      <section className={`${shared.panel} ${styles.groups}`} aria-label="Группы каталога">
        <header className={styles.groupsHead}>
          <h2 className={shared.panelTitle}>Группы</h2>
          <button type="button" className={`${shared.iconButton} ${shared.iconButtonOutlined}`} aria-label="Добавить группу" title="Добавить группу"
            onClick={() => setGroupModal({ id: 0, typeId: type.id, name: "" })}>
            <AddRoundedIcon />
          </button>
        </header>
        <div className={styles.groupList}>
          <button type="button" className={styles.groupItem} aria-current={groupId === 0 ? "true" : undefined} onClick={() => setGroupId(0)}>
            <span className={styles.groupName}>Все группы</span>
            <span className={styles.groupCount}>{items.length}</span>
          </button>
          {groups.map((group) => (
            <button key={group.id} type="button" className={styles.groupItem} aria-current={groupId === group.id ? "true" : undefined} onClick={() => setGroupId(group.id)}>
              <span className={styles.groupName}>{group.name}</span>
              <span className={styles.groupCount}>{counts.get(group.id) ?? 0}</span>
            </button>
          ))}
        </div>
        {activeGroup ? (
          <div className={styles.groupTools}>
            <Button variant="ghost" size="sm" leadingIcon={<EditRoundedIcon />} onClick={() => setGroupModal(activeGroup)}>Переименовать</Button>
            <button
              type="button"
              className={`${shared.iconButton} ${shared.iconButtonDanger} ${styles.pushRight}`}
              aria-label={`Удалить группу «${activeGroup.name}»`}
              title="Удалить группу"
              onClick={() => setConfirmation({
                title: "Удалить группу?",
                message: `Группа «${activeGroup.name}» будет удалена из каталога. Удалить можно только пустую группу.`,
                label: "Удалить",
                run: async () => { await deleteGroup(activeGroup.id, actor); setGroupId(0); },
              })}
            >
              <DeleteOutlineRoundedIcon />
            </button>
          </div>
        ) : null}
      </section>

      <section className={`${shared.panel} ${styles.items}`} aria-label="Позиции каталога">
        <div className={styles.itemsToolbar}>
          <label className={shared.searchField}>
            <SearchRoundedIcon aria-hidden="true" />
            <span className={shared.srOnly}>Поиск по позициям</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или артикул" />
          </label>
          <Select label="Состояние" hideLabel wrapperClassName={`${shared.compactField} ${styles.stateFilter}`} options={stateOptions} value={state} onChange={(event) => setState(event.target.value)} />
          <Button variant="primary" leadingIcon={<AddRoundedIcon />} disabled={groups.length === 0} title={groups.length === 0 ? "Сначала добавьте группу" : undefined} onClick={() => setItemModal(newItem())}>
            Добавить позицию
          </Button>
        </div>

        {selectedIds.length > 0 ? (
          <div className={styles.bulk} role="region" aria-label="Действия с выбранными позициями">
            <strong>Выбрано: {selectedIds.length}</strong>
            <Button size="sm" onClick={() => void run(() => patchItems(selectedIds, { isActive: true }, actor), "Позиции включены")}>Включить</Button>
            <Button size="sm" onClick={() => void run(() => patchItems(selectedIds, { isActive: false }, actor), "Позиции выключены")}>Выключить</Button>
            <Select
              label="Перенести в группу"
              hideLabel
              placeholder="Перенести в группу…"
              wrapperClassName={`${shared.compactField} ${styles.bulkGroup}`}
              options={groups.map((group) => ({ value: String(group.id), label: group.name }))}
              value=""
              onChange={(event) => void run(async () => { await patchItems(selectedIds, { groupId: Number(event.target.value) }, actor); setSelected(new Set()); }, "Позиции перенесены")}
            />
            <Button
              size="sm"
              variant="ghost"
              className={styles.pushRight}
              onClick={() => setConfirmation({
                title: "Удалить позиции?",
                message: `Из каталога будет удалено: ${positionsLabel(selectedIds.length)}. В оформленных заказах они останутся.`,
                label: "Удалить",
                run: async () => { await deleteItems(selectedIds, actor); setSelected(new Set()); },
              })}
            >
              Удалить
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Снять выделение</Button>
          </div>
        ) : null}

        {visible.length === 0 ? (
          <StatePanel
            icon={<Inventory2OutlinedIcon />}
            title={items.length === 0 ? "В каталоге пока нет позиций" : "Позиций не найдено"}
            text={items.length === 0
              ? groups.length === 0 ? "Создайте группу, затем добавьте в неё позиции." : "Добавьте первую позицию — она появится в редакторе заказа."
              : "Измените запрос, фильтр или выберите другую группу."}
          />
        ) : (
          <div className={styles.table} role="table" aria-label="Позиции" data-prices={hasPrices || undefined}>
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
              <span role="columnheader" className={styles.colNumber}>Максимум</span>
              {hasPrices ? <span role="columnheader" className={styles.colNumber}>Цена</span> : null}
              <span role="columnheader" className={styles.colCenter} title="Доступна собственным торговым точкам">Собств.</span>
              <span role="columnheader" className={styles.colCenter} title="Доступна партнёрским торговым точкам">Партн.</span>
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
                  <small>{item.article}{groupId === 0 ? ` · ${groupById.get(item.groupId)?.name ?? ""}` : ""}</small>
                </div>
                <span role="cell" className={`${styles.colNumber} ${styles.colStep} ${shared.numeric}`} data-label="Кратность">{formatQuantity(item.step)}</span>
                <span role="cell" className={`${styles.colNumber} ${styles.colMax} ${shared.numeric}`} data-label="Максимум">
                  {item.maxQuantity === null ? "—" : formatQuantity(item.maxQuantity)}
                </span>
                {hasPrices ? (
                  <span role="cell" className={`${styles.colNumber} ${styles.colPrice} ${shared.numeric}`}>{item.price === null ? "—" : formatPrice(item.price)}</span>
                ) : null}
                <span role="cell" className={`${styles.colCenter} ${styles.colOwn}`}>
                  <Checkbox size="sm" label={<span className={styles.cellLabel}>Собственные ТТ</span>} checked={item.forOwn}
                    onChange={(event) => void run(() => patchItems([item.id], { forOwn: event.target.checked }, actor))} />
                </span>
                <span role="cell" className={`${styles.colCenter} ${styles.colPartner}`}>
                  <Checkbox size="sm" label={<span className={styles.cellLabel}>Партнёрские ТТ</span>} checked={item.forPartner}
                    onChange={(event) => void run(() => patchItems([item.id], { forPartner: event.target.checked }, actor))} />
                </span>
                <span role="cell" className={`${styles.colCenter} ${styles.colToggle}`}>
                  <Toggle small ariaLabel={`«${item.name}»: доступна для заказа`} checked={item.isActive}
                    onChange={(checked) => void run(() => patchItems([item.id], { isActive: checked }, actor))} />
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

      {groupModal ? (
        <GroupModal
          key={`group-${groupModal.id}`}
          group={groupModal}
          actor={actor}
          onClose={() => setGroupModal(null)}
          onSaved={(saved) => { setGroupModal(null); setGroupId(saved.id); void run(async () => undefined, `Группа «${saved.name}» сохранена`); }}
        />
      ) : null}
      {itemModal ? (
        <ItemModal
          key={`item-${itemModal.id}`}
          item={itemModal}
          groups={groups}
          actor={actor}
          onClose={() => setItemModal(null)}
          onSaved={(saved) => { setItemModal(null); void run(async () => undefined, `«${saved.name}» сохранена`); }}
        />
      ) : null}
      <ConfirmModal
        isOpen={confirmation !== null}
        title={confirmation?.title}
        message={confirmation?.message}
        confirmLabel={confirmation?.label}
        cancelLabel="Отмена"
        onCancel={() => setConfirmation(null)}
        onConfirm={() => {
          const pending = confirmation;
          setConfirmation(null);
          if (pending) void run(pending.run);
        }}
      />
    </div>
  );
}
