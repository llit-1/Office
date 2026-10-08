import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useNotifications } from "@toolpad/core";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import Button from "../../Components/Button/Button";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../Components/Select/Select";
import StatePanel from "../../Components/StatePanel/StatePanel";
import StatusBadge from "../../Components/StatusBadge/StatusBadge";
import { cancelOrder, getOrders, getOrdersErrorMessage, type Actor } from "./orders.api";
import {
  formatDateTime,
  formatDay,
  formatDelivery,
  formatMoment,
  formatMoney,
  ordersLabel,
  positionsLabel,
  statusHints,
  statusLabels,
  statusTones,
} from "./orders.format";
import { canCancelOrder, canEditOrder, getOrderStatus, orderTotals, resolveSlot, type OrderTotals } from "./orders.rules";
import type { Order, OrdersBootstrap, OrderStatus, OrderTypeConfig } from "./orders.types";
import OrderDetailsModal from "./components/OrderDetailsModal";
import { CancelOrderModal, TypePickerModal } from "./components/OrderDialogs";
import { useLoader, useNow } from "./useOrdersBase";
import shared from "./Orders.module.css";
import styles from "./OrdersList.module.css";

const PAGE_SIZE = 60;

interface Row {
  order: Order;
  type: OrderTypeConfig;
  status: OrderStatus;
  totals: OrderTotals;
}

const isActive = (status: OrderStatus) => status === "open" || status === "locked";

export default function OrdersListPage({ base, actor }: { base: OrdersBootstrap; actor: Actor }) {
  const navigate = useNavigate();
  const location = useLocation();
  const notifications = useNotifications();
  const now = useNow();
  const [params, setParams] = useSearchParams();
  const { data: orders, error, reload } = useLoader(getOrders);

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [flipped, setFlipped] = useState<{ expanded: boolean; keys: Set<number> }>({ expanded: false, keys: new Set() });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const highlight = (location.state as { highlight?: number } | null)?.highlight;

  const activeTypes = useMemo(() => base.types.filter((type) => type.isActive), [base.types]);
  const typeById = useMemo(() => new Map(base.types.map((type) => [type.id, type])), [base.types]);

  const selectedType = activeTypes.find((type) => type.id === Number(params.get("type"))) ?? null;
  const storeId = Number(params.get("store")) || 0;
  const showAll = params.get("scope") === "all";
  const detailsId = Number(params.get("order")) || 0;
  const needle = deferredQuery.trim().toLocaleLowerCase("ru-RU");
  // по всем ТТ список открывается свёрнутым; при выборе одной ТТ или поиске заказы видны сразу
  const expandedByDefault = storeId !== 0 || needle !== "";

  const setParam = useCallback((patch: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    }, { replace: true });
  }, [setParams]);

  useEffect(() => { setLimit(PAGE_SIZE); }, [selectedType, storeId, showAll, needle]);

  // поисковый индекс строится один раз на загрузку, а не на каждый символ
  const indexed = useMemo(() => (orders ?? []).flatMap((order) => {
    const type = typeById.get(order.typeId);
    if (!type) return [];
    const haystack = [order.id, formatDay(order.deliveryDate), order.storeName, order.createdBy.name, ...order.lines.map((line) => line.name)]
      .join(" ").toLocaleLowerCase("ru-RU");
    return [{ order, type, totals: orderTotals(order.lines), haystack }];
  }), [orders, typeById]);

  const rows = useMemo<(Row & { haystack: string })[]>(
    () => indexed.map((item) => ({ ...item, status: getOrderStatus(item.order, now) })),
    [indexed, now],
  );

  const typeCards = useMemo(() => {
    const inStore = rows.filter((row) => isActive(row.status) && (!storeId || row.order.storeId === storeId));
    return {
      total: inStore.length,
      types: activeTypes.map((type) => {
        const closeAt = resolveSlot(type, null, now)?.closeAt;
        return {
          type,
          caption: closeAt ? `Приём до ${formatMoment(closeAt)}` : "Расписание не настроено",
          active: inStore.filter((row) => row.type.id === type.id).length,
        };
      }),
    };
  }, [activeTypes, now, rows, storeId]);

  const groups = useMemo(() => {
    const visible = rows.filter((row) =>
      (!selectedType || row.type.id === selectedType.id)
      && (!storeId || row.order.storeId === storeId)
      && (showAll || isActive(row.status))
      && (!needle || row.haystack.includes(needle)));
    const byStore = new Map<number, Row[]>();
    for (const row of visible) {
      const list = byStore.get(row.order.storeId);
      if (list) list.push(row);
      else byStore.set(row.order.storeId, [row]);
    }
    const list = [...byStore.entries()].map(([id, items]) => ({
      id,
      title: items[0].order.storeName,
      sum: items.reduce((total, row) => total + (row.status === "cancelled" ? 0 : row.totals.sum ?? 0), 0),
      // актуальные — ближайшая доставка сверху, история — свежие сверху
      items: [...items].sort((left, right) =>
        (showAll ? right.order.deliveryDate.localeCompare(left.order.deliveryDate) : left.order.deliveryDate.localeCompare(right.order.deliveryDate))
        || right.order.createdAt.localeCompare(left.order.createdAt)),
    }));
    list.sort((left, right) => left.title.localeCompare(right.title, "ru"));
    return { list, total: visible.length };
  }, [needle, rows, selectedType, showAll, storeId]);

  const flippedKeys = flipped.expanded === expandedByDefault ? flipped.keys : null;
  const toggleGroup = (id: number) => {
    const keys = new Set(flippedKeys);
    if (keys.has(id)) keys.delete(id);
    else keys.add(id);
    setFlipped({ expanded: expandedByDefault, keys });
  };

  // если на ближайшую доставку заказ уже есть, редактор сам откроет его на изменение
  const startOrder = (type: OrderTypeConfig) => navigate(`/Orders/new/${type.id}${storeId ? `?store=${storeId}` : ""}`);
  const newOrder = () => (selectedType ? startOrder(selectedType) : activeTypes.length === 1 ? startOrder(activeTypes[0]) : setPickerOpen(true));

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await cancelOrder(cancelTarget.id, actor);
      notifications.show(`Заказ № ${cancelTarget.id} отменён`, { severity: "success", autoHideDuration: 3000 });
      setCancelTarget(null);
      setParam({ order: null });
      await reload();
    } catch (reason) {
      notifications.show(getOrdersErrorMessage(reason, "Не удалось отменить заказ."), { severity: "error", autoHideDuration: 5000 });
    } finally {
      setCancelling(false);
    }
  };

  if (!orders) {
    return error ? (
      <StatePanel
        tone="error"
        icon={<ErrorOutlineRoundedIcon />}
        title="Заказы не загрузились"
        text="Проверьте соединение и повторите попытку."
        action={<Button variant="primary" onClick={() => void reload()}>Повторить</Button>}
      />
    ) : <div className={shared.loading}><LoadingSpinner size={96} label="Загружаем заказы…" /></div>;
  }

  const canEdit = actor.permissions.canEdit;
  const filtered = Boolean(selectedType || storeId || needle);
  const details = detailsId ? rows.find((row) => row.order.id === detailsId) : undefined;
  let rendered = 0;

  return (
    <>
      <section className={styles.types} aria-label="Вкладка заказов">
        <button type="button" className={styles.typeCard} aria-pressed={!selectedType} onClick={() => setParam({ type: null })}>
          <span className={styles.typeText}>
            <strong>Все заказы</strong>
            <small>Все вкладки</small>
          </span>
          <span className={styles.typeCount} title="Актуальных заказов">{typeCards.total}</span>
        </button>
        {typeCards.types.map(({ type, caption, active }) => (
          <button
            key={type.id}
            type="button"
            className={styles.typeCard}
            aria-pressed={selectedType?.id === type.id}
            onClick={() => setParam({ type: selectedType?.id === type.id ? null : String(type.id) })}
          >
            <span className={styles.typeText}>
              <strong>{type.name}</strong>
              <small>{caption}</small>
            </span>
            <span className={styles.typeCount} title="Актуальных заказов">{active}</span>
          </button>
        ))}
      </section>

      <section className={styles.toolbar} aria-label="Фильтры">
        <label className={`${shared.searchField} ${styles.search}`}>
          <SearchRoundedIcon aria-hidden="true" />
          <span className={shared.srOnly}>Поиск по заказам</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Номер, дата доставки, сотрудник или позиция" />
        </label>
        <Select
          label="Торговая точка"
          hideLabel
          wrapperClassName={`${shared.compactField} ${styles.storeFilter}`}
          options={[{ value: "0", label: "Все торговые точки" }, ...base.stores.map((store) => ({ value: String(store.id), label: store.closed ? `${store.name} (закрыта)` : store.name }))]}
          value={String(storeId)}
          search={base.stores.length > 10}
          onChange={(event) => setParam({ store: event.target.value === "0" ? null : event.target.value })}
        />
        <div className={shared.segmented} role="group" aria-label="Какие заказы показывать">
          <button type="button" className={shared.segment} aria-pressed={!showAll} onClick={() => setParam({ scope: null })}>Актуальные</button>
          <button type="button" className={shared.segment} aria-pressed={showAll} onClick={() => setParam({ scope: "all" })}>Все</button>
        </div>
        {canEdit && activeTypes.length > 0 ? (
          <Button variant="primary" className={styles.newButton} leadingIcon={<AddRoundedIcon />} onClick={newOrder}>Новый заказ</Button>
        ) : null}
      </section>

      {groups.total === 0 ? (
        <section className={shared.panel}>
          {orders.length === 0 ? (
            <StatePanel
              icon={<ReceiptLongOutlinedIcon />}
              title="Заказов пока нет"
              text="Оформите первый заказ — он появится в этом списке."
              action={canEdit ? <Button variant="primary" leadingIcon={<AddRoundedIcon />} onClick={newOrder}>Новый заказ</Button> : undefined}
            />
          ) : filtered ? (
            <StatePanel
              icon={<SearchOffRoundedIcon />}
              title="Ничего не найдено"
              text={showAll ? "Измените запрос или сбросьте фильтры." : "Среди актуальных заказов совпадений нет. Сбросьте фильтры или посмотрите все заказы."}
              action={<Button variant="secondary" onClick={() => { setQuery(""); setParam({ type: null, store: null }); }}>Сбросить фильтры</Button>}
            />
          ) : (
            <StatePanel
              icon={<ReceiptLongOutlinedIcon />}
              title="Актуальных заказов нет"
              text="Все заказы доставлены или отменены."
              action={<Button variant="secondary" onClick={() => setParam({ scope: "all" })}>Показать все заказы</Button>}
            />
          )}
        </section>
      ) : (
        <div className={styles.groups}>
          {groups.list.map((group) => {
            if (rendered >= limit) return null;
            const expanded = (expandedByDefault || group.items.some((row) => row.order.id === highlight)) !== (flippedKeys?.has(group.id) ?? false);
            const items = expanded ? group.items.slice(0, limit - rendered) : [];
            rendered += items.length;
            return (
              <section key={group.id} className={`${shared.panel} ${styles.group}`}>
                <button type="button" className={styles.groupHeader} aria-expanded={expanded} onClick={() => toggleGroup(group.id)}>
                  <ExpandMoreRoundedIcon className={styles.chevron} aria-hidden="true" />
                  <h2 className={styles.groupTitle}>{group.title}</h2>
                  <span className={styles.groupMeta}>
                    {ordersLabel(group.items.length)}
                    {group.sum > 0 ? <span className={`${styles.groupSum} ${shared.numeric}`}>{formatMoney(group.sum)}</span> : null}
                  </span>
                </button>
                {items.map(({ order, type, status, totals }) => {
                  const delivery = formatDelivery(order.deliveryDate, now);
                  const editable = canEditOrder(order, now, actor.permissions);
                  const cancellable = canCancelOrder(order, now, actor.permissions);
                  const open = () => setParam({ order: String(order.id) });
                  return (
                    <article key={order.id} className={styles.row} data-status={status} data-highlight={highlight === order.id || undefined} onClick={open}>
                      <div className={styles.cellMain}>
                        <button type="button" className={styles.number} onClick={(event) => { event.stopPropagation(); open(); }}>№ {order.id}</button>
                        {selectedType ? null : <span className={styles.sub}>{type.name}</span>}
                      </div>
                      <div className={styles.cellDelivery}>
                        <span>{delivery.date}</span>
                        {delivery.relative ? <span className={styles.sub}>{delivery.relative}</span> : null}
                      </div>
                      <div className={styles.cellVolume}>{positionsLabel(totals.positions)}</div>
                      <div className={`${styles.cellSum} ${shared.numeric}`}>{totals.sum !== null ? formatMoney(totals.sum) : null}</div>
                      <div className={styles.cellAuthor}>
                        <span className={styles.ellipsis} title={order.createdBy.name}>{order.createdBy.name}</span>
                        <span className={styles.sub}>{formatDateTime(order.createdAt)}</span>
                      </div>
                      <div className={styles.cellStatus}>
                        <StatusBadge tone={statusTones[status]} title={statusHints[status]}>{statusLabels[status]}</StatusBadge>
                      </div>
                      {canEdit ? (
                        <div className={styles.cellActions} onClick={(event) => event.stopPropagation()}>
                          {editable ? (
                            <button type="button" className={shared.iconButton} aria-label={`Изменить заказ № ${order.id}`} title="Изменить" onClick={() => navigate(`/Orders/edit/${order.id}`)}>
                              <EditRoundedIcon />
                            </button>
                          ) : null}
                          {cancellable ? (
                            <button type="button" className={`${shared.iconButton} ${shared.iconButtonDanger}`} aria-label={`Отменить заказ № ${order.id}`} title="Отменить заказ" onClick={() => setCancelTarget(order)}>
                              <BlockRoundedIcon />
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </section>
            );
          })}
          {rendered >= limit && groups.total > limit ? (
            <div className={styles.more}>
              <Button variant="secondary" onClick={() => setLimit((value) => value + PAGE_SIZE)}>Показать ещё</Button>
            </div>
          ) : null}
        </div>
      )}

      {details ? (
        <OrderDetailsModal
          order={details.order}
          type={details.type}
          orders={orders}
          actor={actor}
          now={now}
          onClose={() => setParam({ order: null })}
          onEdit={(order) => navigate(`/Orders/edit/${order.id}`)}
          onRepeat={(order) => navigate(`/Orders/new/${order.typeId}?store=${order.storeId}&from=${order.id}`)}
          onCancel={setCancelTarget}
        />
      ) : null}
      {cancelTarget ? (
        <CancelOrderModal order={cancelTarget} busy={cancelling} onClose={() => setCancelTarget(null)} onConfirm={() => void confirmCancel()} />
      ) : null}
      {pickerOpen ? (
        <TypePickerModal types={activeTypes} onClose={() => setPickerOpen(false)} onPick={(type) => { setPickerOpen(false); startOrder(type); }} />
      ) : null}
    </>
  );
}
