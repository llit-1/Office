import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { Navigate, useParams } from "react-router-dom";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import { useNotifications } from "@toolpad/core";
import Button from "../../Components/Button/Button";
import ConfirmModal from "../../Components/ConfirmModal/ConfirmModal";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";
import StatePanel from "../../Components/StatePanel/StatePanel";
import { getFriendlyErrorMessage } from "../../Services/api";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { useLoader } from "../Orders/useOrdersBase";
import { blockCalculatorItem, getCalculatorSheet, saveCalculatorEntry, unblockCalculatorItem } from "./calculator.api";
import { findCategory } from "./calculator.categories";
import { formatTime } from "./calculator.plan";
import { buildRow, buildSummary, EMPTY_ENTRY, type EntryState } from "./calculator.rows";
import type { CalculatorItem, CalculatorSheet } from "./calculator.types";
import CalculatorRow from "./components/CalculatorRow";
import CalculatorPrintSheet from "./components/CalculatorPrintSheet";
import CalculatorSummary from "./components/CalculatorSummary";
import { useCalculatorTt } from "./useCalculatorTt";
import styles from "./CalculatorPage.module.css";

/** Пауза во вводе, после которой значение уходит на сервер. */
const SAVE_DELAY_MS = 700;

export default function CalculatorPage() {
  const { category: slug } = useParams();
  const category = findCategory(slug);
  const dispatch = useDispatch();
  const { locations, current } = useCalculatorTt();

  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(pathSet({ path: "/Calculator" }));
    const tt = locations.data && locations.data.length > 1 && current ? ` · ${current.name}` : "";
    dispatch(titleSet({ title: `${category?.title ?? "Калькуляторы"}${tt}` }));
  }, [dispatch, category, current, locations.data]);

  if (!category) return <Navigate to="/Calculator" replace />;
  if (!locations.data) {
    return locations.error ? (
      <StatePanel
        tone="error"
        icon={<ErrorOutlineRoundedIcon />}
        title="Не удалось загрузить точки"
        action={<Button onClick={() => void locations.reload()}>Повторить</Button>}
      />
    ) : (
      <div className={styles.loading}><LoadingSpinner label="Загружаем…" /></div>
    );
  }
  if (!current) {
    return <StatePanel icon={<StorefrontOutlinedIcon />} title="Нет точек с калькулятором" text="Попросите администратора привязать вашу торговую точку к учётной записи." />;
  }

  return <CalculatorSheetView key={`${category.slug}:${current.code}`} categorySlug={category.slug} tt={current.code} />;
}

/** Изменился ли спрос позиции: добавки из группы замен. */
const demandMoved = (prev: CalculatorItem, next: CalculatorItem) =>
  prev.addThis !== next.addThis || prev.addNext !== next.addNext || prev.addSecond !== next.addSecond;

/** Что ввели за последние полчаса — как сохранили, без пересчёта. */
function entriesFromLog(items: CalculatorItem[]): Record<number, EntryState> {
  const entries: Record<number, EntryState> = {};
  for (const item of items) {
    const last = item.last;
    if (!last || last.rest == null) continue;
    entries[item.rkCode] = {
      rest: String(last.rest),
      fact: last.fact == null ? "" : String(last.fact),
      status: "saved",
      loggedRest: String(last.rest),
      loggedPlan: last.result ?? undefined,
    };
  }
  return entries;
}

/** Расчёт одной категории на одной точке; при смене категории или точки монтируется заново. */
function CalculatorSheetView({ categorySlug, tt }: { categorySlug: string; tt: number }) {
  const category = findCategory(categorySlug)!;
  const notifications = useNotifications();
  const load = useCallback(() => getCalculatorSheet(category.slug, tt), [category.slug, tt]);
  const sheetState = useLoader(load);
  const [items, setItems] = useState<CalculatorItem[] | null>(null);
  const [entries, setEntries] = useState<Record<number, EntryState>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [locking, setLocking] = useState<number | null>(null);
  const [asking, setAsking] = useState<{ item: CalculatorItem; lock: boolean } | null>(null);
  const [printing, setPrinting] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const timers = useRef(new Map<number, { timer: number; item: CalculatorItem }>());
  const saveRef = useRef<(item: CalculatorItem) => Promise<void>>(async () => undefined);

  const sheet: CalculatorSheet | null = sheetState.data;
  useEffect(() => {
    if (!sheet) return;
    setItems(sheet.items);
    entriesRef.current = entriesFromLog(sheet.items);
    setEntries(entriesRef.current);
    setSavedAt(sheet.items.reduce<string | null>((latest, item) => (item.last && (!latest || item.last.at > latest) ? item.last.at : latest), null));
  }, [sheet]);
  // ушли со страницы, не дождавшись паузы во вводе: отправляем сразу, иначе значение пропадёт
  useEffect(() => () => {
    timers.current.forEach(({ timer, item }) => {
      window.clearTimeout(timer);
      void saveRef.current(item);
    });
    timers.current.clear();
  }, []);

  const patchEntry = useCallback((rkCode: number, patch: Partial<EntryState>) => {
    setEntries((prev) => ({ ...prev, [rkCode]: { ...(prev[rkCode] ?? EMPTY_ENTRY), ...patch } }));
  }, []);

  const save = useCallback(async (item: CalculatorItem) => {
    if (!sheet) return;
    const row = buildRow(item, sheet, entriesRef.current[item.rkCode]);
    if (row.plan === null) {
      patchEntry(item.rkCode, { status: "idle" });
      return;
    }
    patchEntry(item.rkCode, { status: "saving" });
    try {
      const result = await saveCalculatorEntry(category.slug, {
        tt,
        rkCode: item.rkCode,
        rest: Number(row.entry.rest),
        result: row.plan,
        fact: row.entry.fact === "" ? null : Number(row.entry.fact),
      });
      // за время запроса могли ввести новое значение — тогда статус выставит следующая отправка
      if (entriesRef.current[item.rkCode]?.status === "saving") patchEntry(item.rkCode, { status: "saved" });
      setSavedAt(result.savedAt);
    } catch {
      patchEntry(item.rkCode, { status: "error" });
    }
  }, [category.slug, patchEntry, sheet, tt]);
  saveRef.current = save;

  const schedule = useCallback((item: CalculatorItem) => {
    const pending = timers.current.get(item.rkCode);
    if (pending) window.clearTimeout(pending.timer);
    const timer = window.setTimeout(() => {
      timers.current.delete(item.rkCode);
      void save(item);
    }, SAVE_DELAY_MS);
    timers.current.set(item.rkCode, { timer, item });
  }, [save]);

  const change = (item: CalculatorItem, patch: Partial<EntryState>) => {
    const entry = { ...(entriesRef.current[item.rkCode] ?? EMPTY_ENTRY), ...patch, status: "pending" as const };
    entriesRef.current = { ...entriesRef.current, [item.rkCode]: entry };
    setEntries(entriesRef.current);
    schedule(item);
  };

  /**
   * Блокировка переносит спрос между позициями группы замен: берём свежие средние, ввод не трогаем.
   * Сохранённый план тех строк, чей спрос изменился, устарел — считаем его заново и записываем.
   */
  const refreshAfterBlock = async (blocked: CalculatorItem, block: CalculatorItem["block"]) => {
    let fresh: CalculatorSheet;
    try {
      fresh = await getCalculatorSheet(category.slug, tt);
    } catch {
      notifications.show("План соседних позиций мог устареть — обновите страницу", { severity: "warning", autoHideDuration: 5000 });
      return;
    }
    const before = new Map(items?.map((x) => [x.rkCode, x]));
    const next = fresh.items.map((x) => (x.rkCode === blocked.rkCode ? { ...x, block } : x));
    setItems(next);
    const stale = next.filter((x) => {
      const prev = before.get(x.rkCode);
      return x.rkCode !== blocked.rkCode && !x.block && prev !== undefined && demandMoved(prev, x) && Boolean(entriesRef.current[x.rkCode]?.rest);
    });
    for (const x of stale) {
      entriesRef.current = {
        ...entriesRef.current,
        [x.rkCode]: { ...entriesRef.current[x.rkCode], loggedRest: undefined, loggedPlan: undefined, status: "pending" },
      };
      schedule(x);
    }
    setEntries(entriesRef.current);
  };

  const setBlock = async (item: CalculatorItem, lock: boolean) => {
    setLocking(item.rkCode);
    try {
      const block = lock ? await blockCalculatorItem(category.slug, tt, item.rkCode, Number(entriesRef.current[item.rkCode]?.rest ?? 0)) : null;
      if (!lock) await unblockCalculatorItem(category.slug, tt, item.rkCode);
      setItems((prev) => prev?.map((x) => (x.rkCode === item.rkCode ? { ...x, block } : x)) ?? prev);
      await refreshAfterBlock(item, block);
    } catch (error) {
      notifications.show(getFriendlyErrorMessage(error, lock ? "Не удалось заблокировать" : "Не удалось вернуть позицию"), { severity: "error", autoHideDuration: 5000 });
    } finally {
      setLocking(null);
    }
  };

  const retryFailed = () => {
    items?.filter((item) => entries[item.rkCode]?.status === "error").forEach((item) => void save(item));
  };

  const rows = useMemo(
    () => (sheet && items ? items.map((item) => buildRow(item, sheet, entries[item.rkCode])) : []),
    [entries, items, sheet],
  );
  // заблокированные остаются на месте, но в итог не входят
  const summary = useMemo(() => buildSummary(rows.filter((row) => !row.item.block)), [rows]);

  const fitToScreen = useCallback(() => {
    const page = pageRef.current;
    if (!page) return;
    if (page.contains(document.activeElement) && document.activeElement instanceof HTMLInputElement) return;

    const main = page.closest(".main");
    const mainBottom = main?.getBoundingClientRect().bottom ?? window.innerHeight;
    const bottomPadding = main ? parseFloat(window.getComputedStyle(main).paddingBottom) || 0 : 0;
    const availableHeight = Math.min(mainBottom - bottomPadding, window.innerHeight) - page.getBoundingClientRect().top - 24;
    if (availableHeight <= 0) return;

    page.style.zoom = "1";
    if (page.getBoundingClientRect().height <= availableHeight) return;

    let lower = 0.12;
    let upper = 1;
    for (let step = 0; step < 12; step += 1) {
      const middle = (lower + upper) / 2;
      page.style.zoom = String(middle);
      if (page.getBoundingClientRect().height <= availableHeight) lower = middle;
      else upper = middle;
    }
    page.style.zoom = String(lower);
  }, []);

  useLayoutEffect(() => fitToScreen(), [fitToScreen, items, rows.length]);

  useEffect(() => {
    window.addEventListener("resize", fitToScreen);
    return () => window.removeEventListener("resize", fitToScreen);
  }, [fitToScreen]);

  useEffect(() => {
    if (!printing) return;
    const onAfterPrint = () => setPrinting(false);
    window.addEventListener("afterprint", onAfterPrint);
    const timer = window.setTimeout(() => window.print(), 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [printing]);

  if (!sheet || !items) {
    return sheetState.error ? (
      <StatePanel
        tone="error"
        icon={<ErrorOutlineRoundedIcon />}
        title="Не удалось загрузить калькулятор"
        action={<Button onClick={() => void sheetState.reload()}>Повторить</Button>}
      />
    ) : (
      <div className={styles.loading}><LoadingSpinner label="Считаем…" /></div>
    );
  }

  const statuses = Object.values(entries).map((entry) => entry.status);
  const status = statuses.includes("error")
    ? { tone: "error", text: "Не всё сохранено", action: <button type="button" className={styles.statusRetry} onClick={retryFailed}>Повторить</button> }
    : statuses.includes("saving") || statuses.includes("pending")
      ? { tone: "busy", text: "Сохраняем…" }
      : savedAt
        ? { tone: "ok", text: `Сохранено в ${formatTime(savedAt)}` }
        : null;

  return (
    <div className={styles.page} ref={pageRef}>
      <CalculatorSummary
        summary={summary}
        status={status}
        action={<Button leadingIcon={<PrintOutlinedIcon />} onClick={() => setPrinting(true)}>Печать</Button>}
      />
      <section className={styles.list} aria-label="Позиции">
        <div className={styles.head} data-sandwich={category.slug === "sandwiches" || undefined} aria-hidden="true">
          <span>Позиция</span>
          <span>Осталось</span>
          <span>План</span>
          <span>Факт</span>
          {category.slug === "sandwiches" ? <span>Булок</span> : null}
          <span />
        </div>
        {rows.length === 0 ? (
          <p className={styles.empty}>В этой категории нет позиций для точки.</p>
        ) : (
          rows.map((row) => (
            <CalculatorRow
              key={row.item.rkCode}
              row={row}
              category={category}
              locking={locking === row.item.rkCode}
              onRest={(rest) => change(row.item, rest === "" ? { rest, fact: "" } : { rest })}
              onFact={(fact) => change(row.item, { fact })}
              onLock={() => setAsking({ item: row.item, lock: true })}
              onUnlock={() => setAsking({ item: row.item, lock: false })}
            />
          ))
        )}
      </section>

      {printing ? <CalculatorPrintSheet sheet={sheet} rows={rows} summary={summary} /> : null}

      <ConfirmModal
        isOpen={asking !== null}
        title={asking?.item.name}
        message={`Вы уверены, что хотите ${asking?.lock ? "заблокировать" : "разблокировать"} данную позицию?`}
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          if (asking) void setBlock(asking.item, asking.lock);
          setAsking(null);
        }}
      />
    </div>
  );
}
