import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useNotifications } from "@toolpad/core";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import ArrowForwardRoundedIcon from "@mui/icons-material/ArrowForwardRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PlaylistAddRoundedIcon from "@mui/icons-material/PlaylistAddRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ShoppingBasketOutlinedIcon from "@mui/icons-material/ShoppingBasketOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import Button from "../../Components/Button/Button";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../Components/Select/Select";
import StatePanel from "../../Components/StatePanel/StatePanel";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { getCatalog, getOrder, getOrders, saveOrder, type Actor } from "./orders.api";
import { formatDelivery, formatMoment, formatMoney, formatPrice, formatQuantity, positionsLabel } from "./orders.format";
import {
  canEditOrder,
  findStoreOffset,
  isItemAvailable,
  normalizeQuantity,
  orderTotals,
  quantityBounds,
  resolveSlot,
  toOrderLine,
  type QuantityBounds,
} from "./orders.rules";
import type { Catalog, CatalogItem, Order, OrderLine, OrdersBootstrap, OrderTypeConfig } from "./orders.types";
import QuantityStepper from "./components/QuantityStepper";
import { useLoader, useMediaQuery, useNow } from "./useOrdersBase";
import shared from "./Orders.module.css";
import styles from "./OrderEditor.module.css";

interface EditorProps {
  base: OrdersBootstrap;
  actor: Actor;
  /** new — param это id вкладки; edit — id заказа. */
  mode: "new" | "edit";
  param: string;
}

type Loaded =
  | { found: false }
  | { found: true; type: OrderTypeConfig; source: Order | null; template: Order | null; catalog: Catalog; orders: Order[] };

export default function OrderEditorPage({ base, actor, mode, param }: EditorProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // «Повторить»: новый заказ наполняется позициями из указанного
  const templateId = Number(searchParams.get("from")) || 0;

  const load = useCallback(async (): Promise<Loaded> => {
    const source = mode === "edit" ? await getOrder(Number(param)) : null;
    const type = base.types.find((candidate) => (source ? candidate.id === source.typeId : candidate.id === Number(param) && candidate.isActive));
    if (!type || (mode === "edit" && !source)) return { found: false };
    const [catalog, orders] = await Promise.all([getCatalog(type.id), getOrders()]);
    const template = mode === "new" ? orders.find((order) => order.id === templateId && order.typeId === type.id) ?? null : null;
    return { found: true, type, source, template, catalog, orders };
  }, [base.types, mode, param, templateId]);
  const { data, error, reload } = useLoader(load);

  if (!actor.permissions.canEdit) return <Navigate to="/Orders" replace />;

  if (!data) {
    return error ? (
      <StatePanel
        tone="error"
        icon={<ErrorOutlineRoundedIcon />}
        title="Не удалось открыть заказ"
        text="Каталог или данные заказа не загрузились. Проверьте соединение и повторите."
        action={<Button variant="primary" onClick={() => void reload()}>Повторить</Button>}
      />
    ) : <div className={shared.loading}><LoadingSpinner size={96} label="Загружаем каталог…" /></div>;
  }

  if (!data.found) {
    return (
      <StatePanel
        icon={<SearchOffRoundedIcon />}
        title={mode === "new" ? "Такой вкладки заказов нет" : "Заказ не найден"}
        text={mode === "new" ? "Возможно, её отключили в настройках." : "Возможно, ссылка устарела."}
        action={<Button variant="primary" onClick={() => navigate("/Orders")}>К списку заказов</Button>}
      />
    );
  }

  if (data.source && !canEditOrder(data.source, new Date(), actor.permissions)) {
    return (
      <StatePanel
        icon={<LockOutlinedIcon />}
        title={`Заказ № ${data.source.id} уже нельзя изменить`}
        text="Время на правки вышло: заказ передан в работу, доставлен или отменён."
        action={<Button variant="primary" onClick={() => navigate(`/Orders?order=${data.source!.id}&scope=all`)}>Открыть заказ</Button>}
      />
    );
  }

  return <EditorForm base={base} actor={actor} type={data.type} source={data.source} template={data.template} catalog={data.catalog} orders={data.orders} />;
}

/* ===== Строка каталога ===== */

interface CatalogRowProps {
  item: CatalogItem;
  quantity: number;
  bounds: QuantityBounds;
  showPrice: boolean;
  onChange: (id: number, quantity: number) => void;
}

const itemNote = (item: CatalogItem) => [
  item.step !== 1 ? `кратно ${formatQuantity(item.step)}` : "",
  item.maxQuantity !== null ? `не больше ${formatQuantity(item.maxQuantity)}` : "",
].filter(Boolean).join(" · ");

const CatalogRow = memo(function CatalogRow({ item, quantity, bounds, showPrice, onChange }: CatalogRowProps) {
  const change = useCallback((value: number) => onChange(item.id, value), [item.id, onChange]);
  const note = itemNote(item);
  return (
    <li className={styles.item} data-selected={quantity > 0 || undefined}>
      <div className={styles.itemText}>
        <span className={styles.itemName}>{item.name}</span>
        <span className={styles.itemMeta}>{item.article}{note ? ` · ${note}` : ""}</span>
      </div>
      {showPrice ? <span className={`${styles.itemPrice} ${shared.numeric}`}>{item.price === null ? "" : formatPrice(item.price)}</span> : null}
      {quantity > 0 ? (
        <QuantityStepper value={quantity} bounds={bounds} name={item.name} onChange={change} />
      ) : (
        <button type="button" className={styles.addButton} aria-label={`Добавить «${item.name}» в заказ`} onClick={() => change(bounds.min)}>
          <AddRoundedIcon />
        </button>
      )}
    </li>
  );
});

/* ===== Форма ===== */

interface EditorFormProps {
  base: OrdersBootstrap;
  actor: Actor;
  type: OrderTypeConfig;
  /** Редактируемый заказ. */
  source: Order | null;
  /** Заказ, с которого наполняется новый. */
  template: Order | null;
  catalog: Catalog;
  orders: Order[];
}

function EditorForm({ base, actor, type, source, template, catalog, orders }: EditorFormProps) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [searchParams] = useSearchParams();
  const now = useNow(20_000);
  const wide = useMediaQuery("(min-width: 1440px)");
  const compact = useMediaQuery("(max-width: 900px)");

  // вкладка и номер заказа — в заголовке портала, отдельная шапка страницы не нужна
  const title = source ? `Заказ № ${source.id}` : type.name;
  useEffect(() => { dispatch(titleSet({ title })); }, [dispatch, title]);

  const openStores = useMemo(() => base.stores.filter((store) => !store.closed), [base.stores]);
  const groupById = useMemo(() => new Map(catalog.groups.map((group) => [group.id, group])), [catalog.groups]);
  const itemById = useMemo(() => new Map(catalog.items.map((item) => [item.id, item])), [catalog.items]);
  const boundsById = useMemo(() => new Map(catalog.items.map((item) => [item.id, quantityBounds(item)])), [catalog.items]);
  const hasPrices = useMemo(() => catalog.items.some((item) => item.price !== null), [catalog.items]);

  const [storeId, setStoreId] = useState(() => {
    if (source) return source.storeId;
    const requested = Number(searchParams.get("store")) || template?.storeId || 0;
    if (openStores.some((store) => store.id === requested)) return requested;
    return openStores.length === 1 ? openStores[0].id : 0;
  });
  const store = base.stores.find((candidate) => candidate.id === storeId);

  /** Количества из другого заказа, которые можно перенести в новый для выбранной ТТ. */
  const portable = useCallback((order: Order, forStoreId: number) => {
    const target = base.stores.find((candidate) => candidate.id === forStoreId);
    const kept = new Map<number, number>();
    const dropped: string[] = [];
    for (const line of order.lines) {
      const item = itemById.get(line.productId);
      if (item && isItemAvailable(item, target)) kept.set(item.id, normalizeQuantity(line.quantity, boundsById.get(item.id)!));
      else dropped.push(line.name);
    }
    return { kept, dropped };
  }, [base.stores, boundsById, itemById]);

  const [initial] = useState(() => {
    if (source) return { quantities: new Map(source.lines.map((line) => [line.productId, line.quantity])), dropped: [] as string[] };
    if (!template) return { quantities: new Map<number, number>(), dropped: [] as string[] };
    const { kept, dropped } = portable(template, storeId);
    return { quantities: kept, dropped };
  });
  const [quantities, setQuantities] = useState(initial.quantities);
  const [dropped, setDropped] = useState(initial.dropped);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [groupId, setGroupId] = useState(0);
  const [pane, setPane] = useState<"catalog" | "order">("catalog");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const changeQuantity = useCallback((id: number, quantity: number) => {
    setDirty(true);
    setSubmitError("");
    setQuantities((prev) => {
      const next = new Map(prev);
      if (quantity > 0) next.set(id, quantity);
      else next.delete(id);
      return next;
    });
  }, []);

  const changeStore = (nextId: number) => {
    setStoreId(nextId);
    setSubmitError("");
    const target = base.stores.find((candidate) => candidate.id === nextId);
    const lost = [...quantities.keys()].filter((id) => {
      const item = itemById.get(id);
      return !item || !isItemAvailable(item, target);
    });
    if (lost.length === 0) return;
    setQuantities((prev) => {
      const next = new Map(prev);
      lost.forEach((id) => next.delete(id));
      return next;
    });
    notifications.show(`${positionsLabel(lost.length)} недоступны для этой ТТ и убраны из заказа`, { severity: "warning", autoHideDuration: 5000 });
  };

  /* --- доставка --- */

  // у существующего заказа дата и срок правок зафиксированы; у нового считаются по расписанию вкладки
  const offset = findStoreOffset(base.deliveryDays, type.id, storeId);
  const slot = useMemo(
    () => (source ? { closeAt: Date.parse(source.closeAt), deliveryDate: source.deliveryDate } : storeId ? resolveSlot(type, offset, now) : null),
    [now, offset, source, storeId, type],
  );
  const deliveryDate = slot?.deliveryDate ?? "";

  // на одну доставку у ТТ один заказ: если он уже есть, работаем с ним
  const existing = useMemo(() => {
    if (source || !storeId || !deliveryDate) return null;
    return orders.find((order) => order.typeId === type.id && order.storeId === storeId && order.deliveryDate === deliveryDate && !order.cancelledAt) ?? null;
  }, [deliveryDate, orders, source, storeId, type.id]);

  const cartEmpty = quantities.size === 0;
  const redirected = useRef(false);
  useEffect(() => {
    if (!existing || !cartEmpty || redirected.current) return;
    redirected.current = true;
    notifications.show(`На эту доставку уже есть заказ № ${existing.id} — открыли его`, { severity: "info", autoHideDuration: 4000 });
    navigate(`/Orders/edit/${existing.id}`, { replace: true });
  }, [cartEmpty, existing, navigate, notifications]);

  const previous = useMemo(() => {
    if (source || !storeId) return null;
    return orders.find((order) => order.typeId === type.id && order.storeId === storeId && !order.cancelledAt && order.id !== existing?.id) ?? null;
  }, [existing, orders, source, storeId, type.id]);

  /* --- каталог --- */

  const available = useMemo(() => catalog.items.filter((item) => isItemAvailable(item, store)), [catalog.items, store]);

  const sections = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("ru-RU");
    const byGroup = new Map<number, CatalogItem[]>();
    for (const item of available) {
      if (needle ? !`${item.name} ${item.article}`.toLocaleLowerCase("ru-RU").includes(needle) : groupId !== 0 && item.groupId !== groupId) continue;
      const list = byGroup.get(item.groupId);
      if (list) list.push(item);
      else byGroup.set(item.groupId, [item]);
    }
    return catalog.groups.flatMap((group) => {
      const items = byGroup.get(group.id);
      return items ? [{ group, items }] : [];
    });
  }, [available, catalog.groups, deferredQuery, groupId]);

  const groupNav = useMemo(() => catalog.groups.flatMap((group) => {
    const items = available.filter((item) => item.groupId === group.id);
    if (items.length === 0) return [];
    return [{ group, total: items.length, selected: items.filter((item) => quantities.has(item.id)).length }];
  }), [available, catalog.groups, quantities]);

  const addSection = (items: CatalogItem[]) => {
    setDirty(true);
    setQuantities((prev) => {
      const next = new Map(prev);
      for (const item of items) if (!next.has(item.id)) next.set(item.id, boundsById.get(item.id)!.min);
      return next;
    });
  };

  const pickGroup = (id: number) => { setGroupId(id); setQuery(""); };

  /* --- заказ --- */

  const lines = useMemo(() => {
    const sourceLines = new Map((source?.lines ?? []).map((line) => [line.productId, line]));
    const result: { line: OrderLine; bounds: QuantityBounds; stale: boolean }[] = [];
    for (const [id, quantity] of quantities) {
      const item = itemById.get(id);
      const legacy = sourceLines.get(id);
      if (item && isItemAvailable(item, store)) {
        result.push({ line: toOrderLine(item, groupById.get(item.groupId), quantity), bounds: boundsById.get(id)!, stale: false });
      } else if (legacy) {
        // позицию сняли с заказа после оформления: оставляем как есть, можно только уменьшить или убрать
        result.push({ line: { ...legacy, quantity }, bounds: { min: legacy.step, max: Math.max(legacy.step, legacy.quantity), step: legacy.step }, stale: true });
      }
    }
    return result.sort((left, right) => left.line.groupName.localeCompare(right.line.groupName, "ru") || left.line.name.localeCompare(right.line.name, "ru"));
  }, [boundsById, groupById, itemById, quantities, source, store]);

  const orderLines = useMemo(() => lines.map((entry) => entry.line), [lines]);
  const totals = orderTotals(orderLines);

  const problems: string[] = [];
  if (!storeId) problems.push("Выберите торговую точку.");
  else if (!slot) problems.push("Для этой вкладки не настроено расписание приёма.");
  if (lines.length === 0) problems.push("Добавьте в заказ хотя бы одну позицию.");
  if (existing) problems.push(`На эту доставку уже есть заказ № ${existing.id}.`);

  const submit = async () => {
    setAttempted(true);
    if (problems.length > 0) {
      if (compact) setPane("order");
      return;
    }
    setSaving(true);
    setSubmitError("");
    try {
      const result = await saveOrder({ id: source?.id ?? null, typeId: type.id, storeId, lines: orderLines }, actor);
      if (!result.ok) {
        setSubmitError(result.message);
        return;
      }
      setDirty(false);
      notifications.show(source ? `Заказ № ${result.order.id} сохранён` : `Заказ № ${result.order.id} оформлен`, { severity: "success", autoHideDuration: 3500 });
      navigate(`/Orders?type=${type.id}`, { state: { highlight: result.order.id } });
    } catch {
      setSubmitError("Не удалось сохранить заказ. Проверьте соединение и повторите — введённые данные сохранены.");
    } finally {
      setSaving(false);
    }
  };

  const leave = () => (dirty ? setLeaveOpen(true) : navigate("/Orders"));
  const searching = deferredQuery.trim() !== "";
  const delivery = deliveryDate ? formatDelivery(deliveryDate, now) : null;

  const catalogPane = (
    <section className={`${shared.panel} ${styles.catalog}`} aria-label="Каталог">
      <div className={styles.catalogHead}>
        <label className={shared.searchField}>
          <SearchRoundedIcon aria-hidden="true" />
          <span className={shared.srOnly}>Поиск по каталогу</span>
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или артикул" />
        </label>
        {!wide ? (
          <div className={shared.chips} role="group" aria-label="Группы каталога">
            <button type="button" className={shared.chip} aria-pressed={groupId === 0 && !searching} onClick={() => pickGroup(0)}>Все</button>
            {groupNav.map(({ group, selected }) => (
              <button key={group.id} type="button" className={shared.chip} aria-pressed={groupId === group.id && !searching} onClick={() => pickGroup(group.id)}>
                {group.name}
                {selected > 0 ? <span className={shared.chipCount}>{selected}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {sections.length === 0 ? (
        <StatePanel
          icon={<SearchOffRoundedIcon />}
          title={searching ? "Ничего не найдено" : "В каталоге нет позиций"}
          text={searching ? "Проверьте запрос: поиск идёт по названию и артикулу во всех группах." : store ? "Для этой торговой точки позиции на вкладке не настроены." : "Позиции этой вкладки ещё не добавлены в настройках."}
        />
      ) : (
        <div className={styles.catalogScroll}>
          {sections.map(({ group, items }) => {
            const missing = items.filter((item) => !quantities.has(item.id));
            return (
              <section key={group.id} className={styles.section}>
                <header className={styles.sectionHead}>
                  <h3 className={styles.sectionTitle}>{group.name}</h3>
                  {compact ? (
                    <button type="button" className={shared.iconButton} disabled={missing.length === 0} aria-label={`Добавить все позиции группы «${group.name}»`} title="Добавить все" onClick={() => addSection(missing)}>
                      <PlaylistAddRoundedIcon />
                    </button>
                  ) : (
                    <Button variant="ghost" size="sm" disabled={missing.length === 0} leadingIcon={<PlaylistAddRoundedIcon />} onClick={() => addSection(missing)}>
                      Добавить все
                    </Button>
                  )}
                </header>
                <ul className={styles.items}>
                  {items.map((item) => (
                    <CatalogRow
                      key={item.id}
                      item={item}
                      quantity={quantities.get(item.id) ?? 0}
                      bounds={boundsById.get(item.id)!}
                      showPrice={hasPrices}
                      onChange={changeQuantity}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </section>
  );

  const orderPane = (
    <section className={`${shared.panel} ${styles.order}`} aria-label="Заказ">
      {/* ТТ, дата и предупреждения по ним закреплены: прокручивается только список позиций */}
      <div className={styles.orderHead}>
        <div className={styles.fields}>
          <Select
            label="Торговая точка"
            placeholder="Выберите точку"
            options={(source ? base.stores.filter((candidate) => candidate.id === storeId) : openStores).map((candidate) => ({ value: String(candidate.id), label: candidate.name }))}
            value={storeId ? String(storeId) : ""}
            search={openStores.length > 10}
            disabled={Boolean(source)}
            onChange={(event) => changeStore(Number(event.target.value))}
          />
          <div className={styles.periodBox}>
            <span>Доставка</span>
            {delivery ? (
              <>
                <strong>{delivery.date}</strong>
                {delivery.relative ? <small>{delivery.relative}</small> : null}
              </>
            ) : <small>{storeId ? "не определена" : "после выбора ТТ"}</small>}
          </div>
        </div>

        {slot ? <p className={styles.hint}>Изменить или отменить заказ можно до {formatMoment(slot.closeAt)}.</p> : null}

        {existing ? (
          <div className={`${shared.notice} ${shared.noticeWarning}`} role="alert">
            <WarningAmberRoundedIcon aria-hidden="true" />
            <div className={shared.noticeBody}>
              <span>На эту доставку у «{existing.storeName}» уже есть заказ № {existing.id}. Второй оформить нельзя — измените существующий.</span>
              <button type="button" className={shared.linkButton} onClick={() => navigate(`/Orders/edit/${existing.id}`)}>Открыть заказ № {existing.id}</button>
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.orderScroll}>
        {dropped.length > 0 ? (
          <div className={`${shared.notice} ${shared.noticeWarning} ${styles.orderNotice}`}>
            <WarningAmberRoundedIcon aria-hidden="true" />
            <div className={shared.noticeBody}>
              <span>Не перенесены в новый заказ — сейчас недоступны: {dropped.join(", ")}.</span>
              <button type="button" className={shared.linkButton} onClick={() => setDropped([])}>Понятно</button>
            </div>
          </div>
        ) : null}

        {lines.length === 0 ? (
          <div className={styles.emptyOrder}>
            <ShoppingBasketOutlinedIcon aria-hidden="true" />
            <strong>В заказе пока пусто</strong>
            <span>Добавляйте позиции кнопкой «+» в каталоге.</span>
            {previous ? (
              <Button variant="secondary" size="sm" onClick={() => {
                const { kept, dropped: lost } = portable(previous, storeId);
                setQuantities(kept);
                setDropped(lost);
                setDirty(true);
              }}>
                Заполнить как в заказе № {previous.id}
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className={styles.lines}>
            {lines.map(({ line, bounds, stale }) => (
              <li key={line.productId} className={styles.line} data-priced={hasPrices || undefined}>
                <div className={styles.lineText}>
                  <span className={styles.itemName}>{line.name}</span>
                  {stale ? <span className={styles.itemMeta}>Снята с заказа — можно уменьшить или убрать</span> : null}
                </div>
                {hasPrices ? (
                  <span className={`${styles.lineSum} ${shared.numeric}`}>{line.price === null ? "" : formatMoney(line.price * line.quantity)}</span>
                ) : null}
                <QuantityStepper value={line.quantity} bounds={bounds} name={line.name} onChange={(value) => changeQuantity(line.productId, value)} />
                <button type="button" className={`${shared.iconButton} ${shared.iconButtonDanger}`} aria-label={`Убрать «${line.name}» из заказа`} title="Убрать из заказа" onClick={() => changeQuantity(line.productId, 0)}>
                  <DeleteOutlineRoundedIcon />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.summary}>
        {(attempted && problems.length > 0) || submitError ? (
          <div className={`${shared.notice} ${shared.noticeDanger}`} role="alert">
            <ErrorOutlineRoundedIcon aria-hidden="true" />
            <div className={shared.noticeBody}>
              {submitError ? <span>{submitError}</span> : problems.map((problem) => <span key={problem}>{problem}</span>)}
            </div>
          </div>
        ) : null}
        <div className={styles.totals}>
          <span>{positionsLabel(totals.positions)}</span>
          {totals.sum !== null ? (
            <strong className={shared.numeric} title={totals.unpriced > 0 ? `По последним ценам отгрузки. Без цены: ${positionsLabel(totals.unpriced)}` : undefined}>
              {formatMoney(totals.sum)}
            </strong>
          ) : null}
        </div>
        <div className={styles.submitRow}>
          <Button variant="ghost" size="lg" onClick={leave} disabled={saving}>Отмена</Button>
          <Button variant="primary" size="lg" className={styles.submit} loading={saving} onClick={() => void submit()}>
            {source ? "Сохранить изменения" : "Оформить заказ"}
          </Button>
        </div>
      </div>
    </section>
  );

  return (
    <div className={styles.editor}>
      {compact ? (
        <div className={`${shared.segmented} ${styles.paneSwitch}`} role="tablist" aria-label="Шаги оформления">
          <button type="button" role="tab" className={shared.segment} aria-selected={pane === "catalog"} onClick={() => setPane("catalog")}>Каталог</button>
          <button type="button" role="tab" className={shared.segment} aria-selected={pane === "order"} onClick={() => setPane("order")}>
            Заказ{lines.length ? ` · ${lines.length}` : ""}
          </button>
        </div>
      ) : null}

      <div className={styles.body} data-wide={wide || undefined}>
        {wide ? (
          <nav className={`${shared.panel} ${styles.rail}`} aria-label="Группы каталога">
            <button type="button" className={styles.railItem} aria-current={groupId === 0 && !searching ? "true" : undefined} onClick={() => pickGroup(0)}>
              <span className={styles.railName}>Все группы</span>
              <span className={styles.railCount}>{available.length}</span>
            </button>
            {groupNav.map(({ group, total, selected }) => (
              <button key={group.id} type="button" className={styles.railItem} aria-current={groupId === group.id && !searching ? "true" : undefined} onClick={() => pickGroup(group.id)}>
                <span className={styles.railName}>{group.name}</span>
                <span className={styles.railCount} data-selected={selected > 0 || undefined}>{selected > 0 ? selected : total}</span>
              </button>
            ))}
          </nav>
        ) : null}
        {!compact || pane === "catalog" ? catalogPane : null}
        {!compact || pane === "order" ? orderPane : null}
      </div>

      {compact && pane === "catalog" ? (
        <div className={styles.mobileBar}>
          <div className={styles.mobileBarText}>
            <strong>{lines.length ? positionsLabel(lines.length) : "Заказ пуст"}</strong>
            {totals.sum !== null ? <span className={shared.numeric}>{formatMoney(totals.sum)}</span> : null}
          </div>
          <Button variant="primary" size="lg" trailingIcon={<ArrowForwardRoundedIcon />} onClick={() => setPane("order")}>К заказу</Button>
        </div>
      ) : null}

      <ConfirmModal
        isOpen={leaveOpen}
        title="Выйти без сохранения?"
        message="Изменения в заказе не сохранены и будут потеряны."
        confirmLabel="Выйти"
        cancelLabel="Остаться"
        onCancel={() => setLeaveOpen(false)}
        onConfirm={() => navigate("/Orders")}
      />
    </div>
  );
}
