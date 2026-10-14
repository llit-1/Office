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
import PlaylistRemoveRoundedIcon from "@mui/icons-material/PlaylistRemoveRounded";
import SearchOffRoundedIcon from "@mui/icons-material/SearchOffRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import ShoppingBasketOutlinedIcon from "@mui/icons-material/ShoppingBasketOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import WarningAmberRoundedIcon from "@mui/icons-material/WarningAmberRounded";
import Button from "../../Components/Button/Button";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import Select from "../../Components/Select/Select";
import StatePanel from "../../Components/StatePanel/StatePanel";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { getOrderContents, getOrders, getOrdersErrorMessage, saveOrder } from "./orders.api";
import { formatDelivery, formatMoment, formatQuantity, positionsLabel } from "./orders.format";
import { normalizeQuantity, quantityBounds, serverDay, serverMoment, type QuantityBounds } from "./orders.rules";
import type { CatalogItem, Order, OrderContents, OrderLine, OrderRule, OrdersBootstrap, OrdersPermissions, ServerDateTime } from "./orders.types";
import QuantityStepper from "./components/QuantityStepper";
import { useMediaQuery, useNow } from "./useOrdersBase";
import shared from "./Orders.module.css";
import styles from "./OrderEditor.module.css";

interface EditorProps {
  base: OrdersBootstrap;
  permissions: OrdersPermissions;
  ruleId: number;
}

export default function OrderEditorPage({ base, permissions, ruleId }: EditorProps) {
  const navigate = useNavigate();
  const rule = base.rules.find((candidate) => candidate.id === ruleId);

  if (!permissions.canEdit) return <Navigate to="/Orders" replace />;

  if (!rule || base.stores.length === 0) {
    return (
      <StatePanel
        icon={rule ? <StorefrontOutlinedIcon /> : <SearchOffRoundedIcon />}
        title={rule ? "К вам не привязана ни одна торговая точка" : "Такого типа заказа нет"}
        text={rule ? "Оформить заказ не на кого: обратитесь к администратору." : "Возможно, ссылка устарела."}
        action={<Button variant="primary" onClick={() => navigate("/Orders")}>К списку заказов</Button>}
      />
    );
  }

  return <EditorForm base={base} permissions={permissions} rule={rule} />;
}

/* ===== Строка каталога ===== */

interface CatalogRowProps {
  item: CatalogItem;
  quantity: number;
  bounds: QuantityBounds;
  onChange: (id: number, quantity: number) => void;
}

const itemNote = (item: CatalogItem, bounds: QuantityBounds) => [
  item.rkcode,
  bounds.step !== 1 ? `кратно ${formatQuantity(bounds.step)}` : "",
].filter(Boolean).join(" · ");

const CatalogRow = memo(function CatalogRow({ item, quantity, bounds, onChange }: CatalogRowProps) {
  const change = useCallback((value: number) => onChange(item.id, value), [item.id, onChange]);
  const note = itemNote(item, bounds);
  return (
    <li className={styles.item} data-selected={quantity > 0 || undefined}>
      <div className={styles.itemText}>
        <span className={styles.itemName}>{item.name}</span>
        {note ? <span className={styles.itemMeta}>{note}</span> : null}
      </div>
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

/** Данные редактора для выбранных торговой точки и даты формирования. */
interface View {
  storeGuid: string;
  contents: OrderContents;
  /** Заказы этой ТТ по типу: какие даты уже заняты и чем наполнить новый заказ. */
  orders: Order[];
}

type Quantities = Map<number, number>;

const toQuantities = (lines: OrderLine[]): Quantities =>
  new Map(lines.map((line) => [line.itemId, line.quantity ?? quantityBounds(line).min]));

function EditorForm({ base, permissions, rule }: { base: OrdersBootstrap; permissions: OrdersPermissions; rule: OrderRule }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [searchParams] = useSearchParams();
  const now = useNow(20_000);
  const compact = useMediaQuery("(max-width: 900px)");

  const [initial] = useState(() => {
    const requested = searchParams.get("store");
    return {
      // единственная торговая точка подставляется сразу
      store: base.stores.find((store) => store.guid === requested)?.guid ?? (base.stores.length === 1 ? base.stores[0].guid : ""),
      date: searchParams.get("date"),
    };
  });

  const [storeGuid, setStoreGuid] = useState(initial.store);
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(Boolean(initial.store));
  const [loadError, setLoadError] = useState("");
  /** Заказ открыли по ссылке уже после даты формирования: такой заказ не меняется. */
  const [lockedOnOpen, setLockedOnOpen] = useState(false);
  /**
   * Переход на другие ТТ или дату, при котором пропадут несохранённые правки:
   * taken — там уже есть заказ, discard — уходим из открытого заказа на свободную дату.
   */
  const [pending, setPending] = useState<{ kind: "taken" | "discard"; next: View } | null>(null);
  // выпадающие списки помнят последний выбор сами: после отказа от перехода пересоздаём их
  const [selectNonce, setSelectNonce] = useState(0);

  const [quantities, setQuantities] = useState<Quantities>(() => new Map());
  /** Состав заказа, уже сохранённого на выбранную дату; у нового заказа пуст. */
  const [baseline, setBaseline] = useState<Quantities>(() => new Map());
  const [dropped, setDropped] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [groupId, setGroupId] = useState(0);
  const [pane, setPane] = useState<"catalog" | "order">("catalog");
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [leaveOpen, setLeaveOpen] = useState(false);

  const contents = view?.contents ?? null;

  // несохранённые правки: корзина отличается от того, что лежит на сервере на выбранную дату
  const dirty = useMemo(
    () => quantities.size !== baseline.size || [...quantities].some(([id, quantity]) => baseline.get(id) !== quantity),
    [baseline, quantities],
  );

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  /* --- загрузка и переходы между ТТ и датами --- */

  const openExisting = (next: View) => {
    const saved = toQuantities(next.contents.lines);
    setView(next);
    setStoreGuid(next.storeGuid);
    setQuantities(saved);
    setBaseline(saved);
    setDropped([]);
    setSubmitError("");
  };

  /** Свободная дата: в корзине то, что передали (у нового заказа — набранное, у открытого — ничего). */
  const openFree = (next: View, cart: Quantities, lost: string[] = []) => {
    setView(next);
    setStoreGuid(next.storeGuid);
    setQuantities(cart);
    setBaseline(new Map());
    setDropped(lost);
    setSubmitError("");
  };

  const request = useRef(0);
  const go = async (nextStore: string, date: ServerDateTime | null, first = false) => {
    const id = ++request.current;
    setLoading(true);
    setLoadError("");
    try {
      const [nextContents, orders] = await Promise.all([
        getOrderContents(rule.id, nextStore, date),
        view?.storeGuid === nextStore ? view.orders : getOrders(rule.id, nextStore).then((groups) => groups.flatMap((group) => group.orders)),
      ]);
      if (id !== request.current) return;
      const next: View = { storeGuid: nextStore, contents: nextContents, orders };
      const available = new Map(nextContents.groups.flatMap((group) => group.items).map((item) => [item.id, item]));

      // сформированный заказ меняет только администратор
      if (first && serverMoment(nextContents.creationDateTime) <= Date.now() && !permissions.canEditClosed) setLockedOnOpen(true);

      if (nextContents.lines.length > 0) {
        // на этой дате уже есть заказ: работаем с ним, но набранное без спроса не бросаем
        if (!first && dirty) {
          setPending({ kind: "taken", next });
          return;
        }
        openExisting(next);
        if (!first) notifications.show("На эту доставку уже есть заказ — открыли его", { severity: "info", autoHideDuration: 4000 });
        return;
      }

      // из открытого заказа на свободную дату его позиции не переносятся; несохранённые правки — только с согласия
      if (isExisting) {
        if (dirty) setPending({ kind: "discard", next });
        else openFree(next, new Map());
        return;
      }

      // новый заказ на свободную дату: набранное остаётся, кроме позиций, которых нет у этой ТТ
      const kept = new Map([...quantities].filter(([itemId]) => available.has(itemId)));
      if (kept.size !== quantities.size) {
        notifications.show(`${positionsLabel(quantities.size - kept.size)} недоступны для этой ТТ и убраны из заказа`, { severity: "warning", autoHideDuration: 5000 });
      }
      openFree(next, kept);
    } catch (reason) {
      if (id !== request.current) return;
      const message = getOrdersErrorMessage(reason, "Не удалось загрузить каталог и даты. Проверьте соединение и повторите.");
      if (view) {
        // остаёмся на прежних ТТ и дате
        notifications.show(message, { severity: "error", autoHideDuration: 5000 });
        setStoreGuid(view.storeGuid);
        setSelectNonce((value) => value + 1);
      } else {
        setLoadError(message);
      }
    } finally {
      if (id === request.current) setLoading(false);
    }
  };

  // первая загрузка — когда торговая точка известна с самого начала
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !initial.store) return;
    started.current = true;
    void go(initial.store, initial.date, true);
  });

  const changeStore = (nextStore: string) => {
    setStoreGuid(nextStore);
    void go(nextStore, contents?.creationDateTime ?? initial.date, !view);
  };

  const stay = () => {
    setPending(null);
    if (view) setStoreGuid(view.storeGuid);
    setSelectNonce((value) => value + 1);
  };

  /* --- даты --- */

  const takenByMoment = useMemo(
    () => new Map((view?.orders ?? []).map((order) => [serverMoment(order.creationDateTime), order])),
    [view],
  );
  const selectedMoment = contents ? serverMoment(contents.creationDateTime) : 0;
  /** Заказ, уже оформленный на выбранную дату. */
  const existing = contents && contents.lines.length > 0 ? takenByMoment.get(selectedMoment) ?? null : null;
  const isExisting = Boolean(contents && contents.lines.length > 0);
  /** Дата формирования наступила, пока форма была открыта: сохранить заказ может только администратор. */
  const closed = Boolean(contents) && selectedMoment <= now.getTime();
  const locked = closed && !permissions.canEditClosed;

  // пользователь выбирает дату доставки, дата формирования подставляется по ней
  const dateOptions = useMemo(() => {
    if (!contents) return [];
    const isOpen = (date: ServerDateTime) => serverMoment(date) > now.getTime();
    // прошедшие даты формирования видит только администратор — и тот, кто открыл именно такую
    const visible = contents.dates.filter((date) => isOpen(date.creationDateTime)
      || permissions.canEditClosed || serverMoment(date.creationDateTime) === selectedMoment);
    // на один день доставки может прийтись несколько дат формирования: берём выбранную,
    // затем ту, на которую уже есть заказ, иначе самую позднюю — у неё больше времени на правки
    const byDay = new Map<string, (typeof visible)[number]>();
    const rank = (date: (typeof visible)[number]) =>
      serverMoment(date.creationDateTime) === selectedMoment ? 2 : takenByMoment.has(serverMoment(date.creationDateTime)) ? 1 : 0;
    for (const date of visible) {
      const day = serverDay(date.shipmentDateTime);
      const current = byDay.get(day);
      if (!current || rank(date) > rank(current) || (rank(date) === rank(current) && date.creationDateTime > current.creationDateTime)) byDay.set(day, date);
    }
    const dates = [...byDay.values()].sort((left, right) => left.shipmentDateTime.localeCompare(right.shipmentDateTime));
    const nearest = dates.find((date) => isOpen(date.creationDateTime));
    return dates.map((date) => {
      const taken = takenByMoment.get(serverMoment(date.creationDateTime));
      const { date: day, relative } = formatDelivery(date.shipmentDateTime, now);
      return {
        value: date.creationDateTime,
        label: [
          date === nearest ? "Ближайшая" : "",
          day,
          relative,
          isOpen(date.creationDateTime) ? "" : "приём закрыт",
          taken ? `заказ № ${taken.id}` : "",
        ].filter(Boolean).join(" · "),
      };
    });
  }, [contents, now, permissions.canEditClosed, selectedMoment, takenByMoment]);

  // тип и номер заказа — в заголовке портала, отдельная шапка страницы не нужна
  const title = existing ? `Заказ № ${existing.id}` : rule.name;
  useEffect(() => { dispatch(titleSet({ title })); }, [dispatch, title]);

  /* --- каталог --- */

  const groups = useMemo(() => contents?.groups ?? [], [contents]);
  const itemById = useMemo(() => new Map(groups.flatMap((group) => group.items).map((item) => [item.id, item])), [groups]);
  const boundsById = useMemo(() => new Map([...itemById.values()].map((item) => [item.id, quantityBounds(item)])), [itemById]);
  const groupNameByItem = useMemo(() => new Map(groups.flatMap((group) => group.items.map((item) => [item.id, group.name] as const))), [groups]);

  const changeQuantity = useCallback((id: number, quantity: number) => {
    setSubmitError("");
    setQuantities((prev) => {
      const next = new Map(prev);
      if (quantity > 0) next.set(id, quantity);
      else next.delete(id);
      return next;
    });
  }, []);

  const sections = useMemo(() => {
    const needle = deferredQuery.trim().toLocaleLowerCase("ru-RU");
    return groups.flatMap((group) => {
      if (!needle && groupId !== 0 && group.id !== groupId) return [];
      const items = needle ? group.items.filter((item) => `${item.name} ${item.rkcode ?? ""}`.toLocaleLowerCase("ru-RU").includes(needle)) : group.items;
      return items.length > 0 ? [{ group, items }] : [];
    });
  }, [deferredQuery, groupId, groups]);

  const groupNav = useMemo(
    () => groups.map((group) => ({ group, selected: group.items.filter((item) => quantities.has(item.id)).length })),
    [groups, quantities],
  );

  const removeSection = (items: CatalogItem[]) => {
    setQuantities((prev) => {
      const next = new Map(prev);
      for (const item of items) next.delete(item.id);
      return next;
    });
  };

  const addSection = (items: CatalogItem[]) => {
    setQuantities((prev) => {
      const next = new Map(prev);
      for (const item of items) if (!next.has(item.id)) next.set(item.id, boundsById.get(item.id)!.min);
      return next;
    });
  };

  const pickGroup = (id: number) => { setGroupId(id); setQuery(""); };

  /* --- заказ --- */

  const lines = useMemo(() => {
    const savedLines = new Map((contents?.lines ?? []).map((line) => [line.itemId, line]));
    const result: { id: number; name: string; group: string; quantity: number; bounds: QuantityBounds; stale: boolean }[] = [];
    for (const [id, quantity] of quantities) {
      const item = itemById.get(id);
      const saved = savedLines.get(id);
      if (item) {
        result.push({ id, name: item.name, group: groupNameByItem.get(id) ?? "", quantity, bounds: boundsById.get(id)!, stale: false });
      } else if (saved) {
        // позицию сняли с заказа после оформления: оставляем как есть, можно только уменьшить или убрать
        const bounds = quantityBounds(saved);
        result.push({ id, name: saved.name, group: "", quantity, bounds: { ...bounds, max: Math.max(bounds.min, baseline.get(id) ?? bounds.min) }, stale: true });
      }
    }
    return result.sort((left, right) => left.group.localeCompare(right.group, "ru") || left.name.localeCompare(right.name, "ru"));
  }, [baseline, boundsById, contents, groupNameByItem, itemById, quantities]);

  /** Последний заказ этой ТТ на другую дату: им можно наполнить пустую корзину. */
  const previous = useMemo(() => {
    if (!view) return null;
    return [...view.orders]
      .filter((order) => order.lines.length > 0 && serverMoment(order.creationDateTime) !== selectedMoment)
      .sort((left, right) => serverMoment(right.creationDateTime) - serverMoment(left.creationDateTime))[0] ?? null;
  }, [selectedMoment, view]);

  const fillFrom = (order: Order) => {
    const cart: Quantities = new Map();
    const lost: string[] = [];
    for (const line of order.lines) {
      const bounds = boundsById.get(line.itemId);
      if (bounds) cart.set(line.itemId, normalizeQuantity(line.quantity ?? 0, bounds) || bounds.min);
      else lost.push(line.name);
    }
    setQuantities(cart);
    setDropped(lost);
  };

  const problems: string[] = [];
  if (!storeGuid) problems.push("Выберите торговую точку.");
  if (lines.length === 0) problems.push("Добавьте в заказ хотя бы одну позицию.");

  const submit = async () => {
    setAttempted(true);
    if (problems.length > 0 || !view) {
      if (compact) setPane("order");
      return;
    }
    setSaving(true);
    setSubmitError("");
    try {
      const id = await saveOrder({
        ruleId: rule.id,
        storeGuid: view.storeGuid,
        creationDateTime: view.contents.creationDateTime,
        lines: lines.map((line) => ({ itemId: line.id, quantity: line.quantity })),
      });
      setBaseline(quantities);
      notifications.show(isExisting ? `Заказ № ${id} сохранён` : `Заказ № ${id} оформлен`, { severity: "success", autoHideDuration: 3500 });
      navigate(`/Orders?type=${rule.id}`, { state: { highlight: id } });
    } catch (reason) {
      setSubmitError(getOrdersErrorMessage(reason, "Не удалось сохранить заказ. Проверьте соединение и повторите — введённые данные сохранены."));
    } finally {
      setSaving(false);
    }
  };

  if (lockedOnOpen && contents) {
    return (
      <StatePanel
        icon={<LockOutlinedIcon />}
        title={existing ? `Заказ № ${existing.id} уже нельзя изменить` : "На эту дату заказ уже не оформить"}
        text="Время на изменение вышло — заказ уже передан в работу."
        action={(
          <Button variant="primary" onClick={() => navigate(existing ? `/Orders?type=${rule.id}&store=${existing.storeGuid}&order=${existing.id}&scope=all` : `/Orders?type=${rule.id}`)}>
            {existing ? "Открыть заказ" : "К списку заказов"}
          </Button>
        )}
      />
    );
  }

  const leave = () => (dirty ? setLeaveOpen(true) : navigate("/Orders"));
  const searching = deferredQuery.trim() !== "";
  const pendingOrder = pending ? pending.next.orders.find((order) => serverMoment(order.creationDateTime) === serverMoment(pending.next.contents.creationDateTime)) : null;
  const pendingStore = pending ? base.stores.find((candidate) => candidate.guid === pending.next.storeGuid)?.name ?? "" : "";
  const pendingDelivery = pending ? formatDelivery(pending.next.contents.shipmentDateTime, now).date : "";

  const catalogPane = (
    <section className={`${shared.panel} ${styles.catalog}`} aria-label="Каталог">
      {!contents ? (
        loadError ? (
          <StatePanel
            tone="error"
            icon={<ErrorOutlineRoundedIcon />}
            title="Каталог не загрузился"
            text={loadError}
            action={<Button variant="primary" onClick={() => void go(storeGuid, initial.date, true)}>Повторить</Button>}
          />
        ) : loading ? (
          <div className={shared.loading}><LoadingSpinner size={96} label="Загружаем каталог…" /></div>
        ) : (
          <StatePanel icon={<StorefrontOutlinedIcon />} title="Выберите торговую точку" text="Каталог и даты заказа зависят от точки." />
        )
      ) : (
        <>
          <div className={styles.catalogHead}>
            <label className={shared.searchField}>
              <SearchRoundedIcon aria-hidden="true" />
              <span className={shared.srOnly}>Поиск по каталогу</span>
              <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Название или код" />
            </label>
            {/* одна группа — фильтровать нечего */}
            {groupNav.length > 1 ? (
              <div className={shared.chips} role="group" aria-label="Группы каталога">
                <button type="button" className={shared.chip} aria-pressed={groupId === 0 && !searching} onClick={() => pickGroup(0)}>Все группы</button>
                {groupNav.map(({ group, selected }) => (
                  <button key={group.id} type="button" className={shared.chip} aria-pressed={groupId === group.id && !searching} onClick={() => pickGroup(group.id)}>
                    {group.name}
                    {selected > 0 ? <span className={shared.chipBadge} title="Позиций в заказе">{selected}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {sections.length === 0 ? (
            <StatePanel
              icon={<SearchOffRoundedIcon />}
              title={searching ? "Ничего не найдено" : "В каталоге нет позиций"}
              text={searching ? "Проверьте запрос: поиск идёт по названию и коду во всех группах." : "Для этой торговой точки позиции этого типа заказа не настроены."}
            />
          ) : (
            <div className={styles.catalogScroll}>
              {sections.map(({ group, items }) => {
                const missing = items.filter((item) => !quantities.has(item.id));
                const added = items.filter((item) => quantities.has(item.id));
                return (
                  <section key={group.id} className={styles.section}>
                    <header className={styles.sectionHead}>
                      <h3 className={styles.sectionTitle}>{group.name}</h3>
                      {/* «Убрать все» появляется, только когда из группы что-то уже в заказе */}
                      <div className={styles.sectionActions}>
                        {added.length > 0 ? (
                          compact ? (
                            <button type="button" className={shared.iconButton} aria-label={`Убрать все позиции группы «${group.name}» из заказа`} title="Убрать все" onClick={() => removeSection(added)}>
                              <PlaylistRemoveRoundedIcon />
                            </button>
                          ) : (
                            <Button variant="ghost" size="sm" leadingIcon={<PlaylistRemoveRoundedIcon />} aria-label={`Убрать все позиции группы «${group.name}» из заказа`} onClick={() => removeSection(added)}>
                              Убрать все
                            </Button>
                          )
                        ) : null}
                        {compact ? (
                          <button type="button" className={shared.iconButton} disabled={missing.length === 0} aria-label={`Добавить все позиции группы «${group.name}»`} title="Добавить все" onClick={() => addSection(missing)}>
                            <PlaylistAddRoundedIcon />
                          </button>
                        ) : (
                          <Button variant="ghost" size="sm" disabled={missing.length === 0} leadingIcon={<PlaylistAddRoundedIcon />} aria-label={`Добавить все позиции группы «${group.name}»`} onClick={() => addSection(missing)}>
                            Добавить все
                          </Button>
                        )}
                      </div>
                    </header>
                    <ul className={styles.items}>
                      {items.map((item) => (
                        <CatalogRow key={item.id} item={item} quantity={quantities.get(item.id) ?? 0} bounds={boundsById.get(item.id)!} onChange={changeQuantity} />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );

  const orderPane = (
    <section className={`${shared.panel} ${styles.order}`} aria-label="Заказ">
      {/* ТТ, дата и доставка закреплены: прокручивается только список позиций */}
      <div className={styles.orderHead}>
        <div className={styles.fields}>
          <Select
            key={`store-${selectNonce}`}
            label="Торговая точка"
            placeholder="Выберите точку"
            options={base.stores.map((candidate) => ({ value: candidate.guid, label: candidate.name }))}
            value={storeGuid}
            search={base.stores.length > 10}
            disabled={loading || saving}
            onChange={(event) => changeStore(event.target.value)}
          />
          {/* значение — дата формирования, а в списке пользователь видит даты доставки */}
          {contents ? (
            <Select
              key={`date-${selectNonce}`}
              label="Предполагаемая дата доставки"
              options={dateOptions}
              value={contents.creationDateTime}
              disabled={loading || saving}
              onChange={(event) => { if (event.target.value !== contents.creationDateTime) void go(storeGuid, event.target.value); }}
            />
          ) : (
            <div className={styles.periodBox}>
              <span>Предполагаемая дата доставки</span>
              <small>{storeGuid ? "загружаем…" : "после выбора ТТ"}</small>
            </div>
          )}
        </div>

        {contents ? (
          <p className={styles.hint}>
            {!closed
              ? `Изменить заказ можно до ${formatMoment(contents.creationDateTime)}.`
              : locked
                ? "Приём заказов на эту доставку закрыт — выберите другую дату."
                : "Время на изменение вышло — вы меняете заказ как администратор."}
          </p>
        ) : null}
      </div>

      <div className={styles.orderScroll}>
        {dropped.length > 0 ? (
          <div className={`${shared.notice} ${shared.noticeWarning} ${styles.orderNotice}`}>
            <WarningAmberRoundedIcon aria-hidden="true" />
            <div className={shared.noticeBody}>
              <span>Не перенесены в заказ — сейчас недоступны: {dropped.join(", ")}.</span>
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
              <Button variant="secondary" size="sm" onClick={() => fillFrom(previous)}>Заполнить как в заказе № {previous.id}</Button>
            ) : null}
          </div>
        ) : (
          <ul className={styles.lines}>
            {lines.map((line) => (
              <li key={line.id} className={styles.line}>
                <div className={styles.lineText}>
                  <span className={styles.itemName}>{line.name}</span>
                  {line.stale ? <span className={styles.itemMeta}>Снята с заказа — можно уменьшить или убрать</span> : null}
                </div>
                <QuantityStepper value={line.quantity} bounds={line.bounds} name={line.name} onChange={(value) => changeQuantity(line.id, value)} />
                <button type="button" className={`${shared.iconButton} ${shared.iconButtonDanger}`} aria-label={`Убрать «${line.name}» из заказа`} title="Убрать из заказа" onClick={() => changeQuantity(line.id, 0)}>
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
          <span>{positionsLabel(lines.length)}</span>
        </div>
        <div className={styles.submitRow}>
          <Button variant="ghost" size="lg" onClick={leave} disabled={saving}>Отмена</Button>
          <Button variant="primary" size="lg" className={styles.submit} loading={saving} disabled={loading || locked} onClick={() => void submit()}>
            {isExisting ? "Сохранить изменения" : "Оформить заказ"}
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

      <div className={styles.body}>
        {!compact || pane === "catalog" ? catalogPane : null}
        {!compact || pane === "order" ? orderPane : null}
      </div>

      {compact && pane === "catalog" ? (
        <div className={styles.mobileBar}>
          <div className={styles.mobileBarText}>
            <strong>{lines.length ? positionsLabel(lines.length) : "Заказ пуст"}</strong>
          </div>
          <Button variant="primary" size="lg" trailingIcon={<ArrowForwardRoundedIcon />} onClick={() => setPane("order")}>К заказу</Button>
        </div>
      ) : null}

      <ConfirmModal
        isOpen={pending !== null}
        title={pending?.kind === "discard" ? "Изменения не сохранены" : "На эту доставку уже есть заказ"}
        message={!pending ? "" : pending.kind === "discard"
          ? `Изменения в заказе${existing ? ` № ${existing.id}` : ""} не сохранены. Если перейти на доставку ${pendingDelivery}, они пропадут.`
          : `У «${pendingStore}» на доставку ${pendingDelivery} уже оформлен заказ${pendingOrder ? ` № ${pendingOrder.id}` : ""}. Если перейти к нему, текущий заказ не будет сохранён.`}
        confirmLabel={pending?.kind === "discard" ? "Перейти" : "Перейти к заказу"}
        cancelLabel="Остаться"
        onCancel={stay}
        onConfirm={() => {
          if (pending?.kind === "taken") openExisting(pending.next);
          else if (pending) openFree(pending.next, new Map());
          setPending(null);
        }}
      />
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
