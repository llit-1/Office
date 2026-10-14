import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
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
import type { RootState } from "../../Store";
import { setOrdersTypeId } from "../../Store/preferencesSlice";
import { getOrders } from "./orders.api";
import { formatDay, formatDelivery, ordersLabel, positionsLabel } from "./orders.format";
import { canEditOrder, editorPath, isOrderOpen, serverMoment } from "./orders.rules";
import type { Order, OrdersBootstrap, OrdersPermissions, StoreOrders } from "./orders.types";
import OrderDetailsModal from "./components/OrderDetailsModal";
import { useLoader, useNow } from "./useOrdersBase";
import shared from "./Orders.module.css";
import styles from "./OrdersList.module.css";

const PAGE_SIZE = 60;

interface Row {
  order: Order;
  haystack: string;
}

export default function OrdersListPage({ base, permissions }: { base: OrdersBootstrap; permissions: OrdersPermissions }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const now = useNow();
  const [params, setParams] = useSearchParams();

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [flipped, setFlipped] = useState<{ expanded: boolean; keys: Set<string> }>({ expanded: false, keys: new Set() });
  const highlight = (location.state as { highlight?: number } | null)?.highlight;

  // список открывается только по выбранному типу: из адреса или последний выбранный пользователем;
  // единственный тип выбирается сам
  const lastRuleId = useSelector((state: RootState) => state.preferences.ordersTypeId);
  // типы, в которых пользователю нечего заказать, не показываем
  const rules = useMemo(() => base.rules.filter((rule) => rule.hasItems), [base.rules]);
  const ruleId = Number(params.get("type")) || lastRuleId || 0;
  const selectedRule = rules.find((rule) => rule.id === ruleId) ?? (rules.length === 1 ? rules[0] : null);
  const selectedRuleId = selectedRule?.id ?? null;
  useEffect(() => {
    if (selectedRuleId !== null && selectedRuleId !== lastRuleId) dispatch(setOrdersTypeId(selectedRuleId));
  }, [dispatch, lastRuleId, selectedRuleId]);

  // единственная торговая точка пользователя выбрана сразу — фильтр по ТТ ему не нужен
  const onlyStore = base.stores.length === 1 ? base.stores[0] : null;
  const storeGuid = onlyStore?.guid ?? (base.stores.find((store) => store.guid === params.get("store"))?.guid ?? null);
  const showAll = params.get("scope") === "all";
  const detailsId = Number(params.get("order")) || 0;
  const needle = deferredQuery.trim().toLocaleLowerCase("ru-RU");
  // по всем ТТ список открывается свёрнутым; при выборе одной ТТ или поиске заказы видны сразу
  const expandedByDefault = storeGuid !== null || needle !== "";

  // заказы запрашиваются по типу и торговой точке; без точки — по всем точкам пользователя
  const requestKey = selectedRuleId === null ? "" : `${selectedRuleId}|${storeGuid ?? ""}`;
  const load = useCallback(
    async (): Promise<{ key: string; groups: StoreOrders[] }> =>
      ({ key: requestKey, groups: selectedRuleId === null ? [] : await getOrders(selectedRuleId, storeGuid) }),
    [requestKey, selectedRuleId, storeGuid],
  );
  const { data: loaded, error, reload } = useLoader(load);
  // ответ на прошлый выбор не показываем как текущий
  const groupsData = loaded && loaded.key === requestKey ? loaded.groups : null;

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

  useEffect(() => { setLimit(PAGE_SIZE); }, [requestKey, showAll, needle]);

  // поисковый индекс строится один раз на загрузку, а не на каждый символ
  const indexed = useMemo(() => (groupsData ?? []).map((group) => ({
    store: group.store,
    orders: group.orders.map((order) => ({
      order,
      haystack: [order.id, order.shipmentDateTime ? formatDay(order.shipmentDateTime) : "", order.userName, ...order.lines.map((line) => line.name)]
        .join(" ").toLocaleLowerCase("ru-RU"),
    })),
  })), [groupsData]);

  const groups = useMemo(() => {
    let total = 0;
    const list = indexed.flatMap(({ store, orders }) => {
      // «Актуальные» — заказы, которые ещё не сформированы; «Все» — вместе с последними сформированными
      const items: Row[] = orders.filter((row) => (showAll || isOrderOpen(row.order, now)) && (!needle || row.haystack.includes(needle)));
      if (items.length === 0) return [];
      // актуальные — ближайшая дата сверху, все — свежие сверху
      items.sort((left, right) => (showAll ? -1 : 1) * (serverMoment(left.order.creationDateTime) - serverMoment(right.order.creationDateTime)));
      total += items.length;
      return [{ store, items }];
    });
    list.sort((left, right) => left.store.name.localeCompare(right.store.name, "ru"));
    return { list, total };
  }, [indexed, needle, now, showAll]);

  const flippedKeys = flipped.expanded === expandedByDefault ? flipped.keys : null;
  const toggleGroup = (guid: string) => {
    const keys = new Set(flippedKeys);
    if (keys.has(guid)) keys.delete(guid);
    else keys.add(guid);
    setFlipped({ expanded: expandedByDefault, keys });
  };

  // если на ближайшую дату заказ уже есть, редактор откроет его на изменение
  const newOrder = () => { if (selectedRule) navigate(editorPath(selectedRule.id, { store: storeGuid })); };
  const editOrder = (order: Order) => navigate(editorPath(order.ruleId, { store: order.storeGuid, date: order.creationDateTime }));

  const canEdit = permissions.canEdit;
  const filtered = Boolean((storeGuid && !onlyStore) || needle);
  const hasOrders = (groupsData ?? []).some((group) => group.orders.length > 0);
  const details = detailsId ? (groupsData ?? []).flatMap((group) => group.orders).find((order) => order.id === detailsId) : undefined;
  let rendered = 0;

  return (
    <>
      <section className={styles.types} aria-label="Тип заказа">
        {rules.map((rule) => (
          <button key={rule.id} type="button" className={styles.typeTab} aria-pressed={selectedRuleId === rule.id} onClick={() => setParam({ type: String(rule.id), order: null })}>
            {rule.name}
          </button>
        ))}
      </section>

      {/* фильтры и список появляются после выбора типа заказа */}
      {selectedRule ? (
        <section className={styles.toolbar} aria-label="Фильтры">
          <label className={`${shared.searchField} ${styles.search}`}>
            <SearchRoundedIcon aria-hidden="true" />
            <span className={shared.srOnly}>Поиск по заказам</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Номер, дата доставки, сотрудник или позиция" />
          </label>
          {onlyStore ? null : (
            <Select
              label="Торговая точка"
              hideLabel
              wrapperClassName={`${shared.compactField} ${styles.storeFilter}`}
              options={[{ value: "", label: "Все торговые точки" }, ...base.stores.map((store) => ({ value: store.guid, label: store.name }))]}
              value={storeGuid ?? ""}
              search={base.stores.length > 10}
              onChange={(event) => setParam({ store: event.target.value || null })}
            />
          )}
          <div className={shared.segmented} role="group" aria-label="Какие заказы показывать">
            <button type="button" className={shared.segment} aria-pressed={!showAll} onClick={() => setParam({ scope: null })}>Актуальные</button>
            <button type="button" className={shared.segment} aria-pressed={showAll} onClick={() => setParam({ scope: "all" })}>Все</button>
          </div>
          {canEdit && base.stores.length > 0 ? (
            <Button variant="primary" className={styles.newButton} leadingIcon={<AddRoundedIcon />} onClick={newOrder}>Новый заказ</Button>
          ) : null}
        </section>
      ) : null}

      {!selectedRule ? (
        <section className={shared.panel}>
          {rules.length === 0 ? (
            <StatePanel icon={<ReceiptLongOutlinedIcon />} title="Заказывать пока нечего" text="Для вас нет ни одной позиции ни в одном типе заказа — обратитесь к администратору раздела." />
          ) : (
            <StatePanel icon={<ReceiptLongOutlinedIcon />} title="Выберите тип заказа" text="Список заказов откроется по выбранному типу." />
          )}
        </section>
      ) : !groupsData ? (
        error ? (
          <section className={shared.panel}>
            <StatePanel
              tone="error"
              icon={<ErrorOutlineRoundedIcon />}
              title="Заказы не загрузились"
              text="Проверьте соединение и повторите попытку."
              action={<Button variant="primary" onClick={() => void reload()}>Повторить</Button>}
            />
          </section>
        ) : <div className={shared.loading}><LoadingSpinner size={96} label="Загружаем заказы…" /></div>
      ) : groups.total === 0 ? (
        <section className={shared.panel}>
          {!hasOrders ? (
            <StatePanel
              icon={<ReceiptLongOutlinedIcon />}
              title="Заказов пока нет"
              text="Оформите первый заказ — он появится в этом списке."
              action={canEdit && base.stores.length > 0 ? <Button variant="primary" leadingIcon={<AddRoundedIcon />} onClick={newOrder}>Новый заказ</Button> : undefined}
            />
          ) : needle ? (
            <StatePanel
              icon={<SearchOffRoundedIcon />}
              title="Ничего не найдено"
              text={showAll ? "Измените запрос или сбросьте фильтры." : "Среди актуальных заказов совпадений нет. Сбросьте фильтры или посмотрите все заказы."}
              action={<Button variant="secondary" onClick={() => { setQuery(""); setParam({ store: null }); }}>Сбросить фильтры</Button>}
            />
          ) : (
            <StatePanel
              icon={<ReceiptLongOutlinedIcon />}
              title="Актуальных заказов нет"
              text={filtered ? "У этой торговой точки все заказы уже сформированы." : "Все заказы уже сформированы."}
              action={<Button variant="secondary" onClick={() => setParam({ scope: "all" })}>Показать все заказы</Button>}
            />
          )}
        </section>
      ) : (
        <div className={styles.groups}>
          {groups.list.map((group) => {
            if (rendered >= limit) return null;
            const expanded = (expandedByDefault || group.items.some((row) => row.order.id === highlight)) !== (flippedKeys?.has(group.store.guid) ?? false);
            const items = expanded ? group.items.slice(0, limit - rendered) : [];
            rendered += items.length;
            return (
              <section key={group.store.guid} className={`${shared.panel} ${styles.group}`}>
                <button type="button" className={styles.groupHeader} aria-expanded={expanded} onClick={() => toggleGroup(group.store.guid)}>
                  <ExpandMoreRoundedIcon className={styles.chevron} aria-hidden="true" />
                  <h2 className={styles.groupTitle}>{group.store.name}</h2>
                  <span className={styles.groupMeta}>{ordersLabel(group.items.length)}</span>
                </button>
                {items.map(({ order }) => {
                  const delivery = order.shipmentDateTime ? formatDelivery(order.shipmentDateTime, now) : null;
                  const open = () => setParam({ order: String(order.id) });
                  return (
                    <article key={order.id} className={styles.row} data-highlight={highlight === order.id || undefined} onClick={open}>
                      <div className={styles.cellMain}>
                        <button type="button" className={styles.number} onClick={(event) => { event.stopPropagation(); open(); }}>№ {order.id}</button>
                      </div>
                      <div className={styles.cellDelivery}>
                        <span>{delivery ? delivery.date : "—"}</span>
                        <span className={styles.sub}>доставка{delivery?.relative ? ` ${delivery.relative}` : ""}</span>
                      </div>
                      <div className={styles.cellVolume}>{positionsLabel(order.lines.length)}</div>
                      <div className={styles.cellAuthor}>
                        <span className={styles.ellipsis} title={order.userName}>{order.userName}</span>
                      </div>
                      {canEdit ? (
                        <div className={styles.cellActions} onClick={(event) => event.stopPropagation()}>
                          {canEditOrder(order, now, permissions) ? (
                            <button type="button" className={shared.iconButton} aria-label={`Изменить заказ № ${order.id}`} title="Изменить" onClick={() => editOrder(order)}>
                              <EditRoundedIcon />
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

      {details && selectedRule ? (
        <OrderDetailsModal
          order={details}
          rule={selectedRule}
          permissions={permissions}
          now={now}
          onClose={() => setParam({ order: null })}
          onEdit={editOrder}
        />
      ) : null}
    </>
  );
}
