import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { bunsFor, formatDuration, plural } from "../calculator.plan";
import type { RowModel, Summary } from "../calculator.rows";
import type { CalculatorSheet } from "../calculator.types";
import styles from "./CalculatorPrintSheet.module.css";

interface CalculatorPrintSheetProps {
  sheet: CalculatorSheet;
  rows: RowModel[];
  summary: Summary;
}

const NO_MODE = "Без режима";
/** Мельче этого один столбец не ужимаем — переходим на два. */
const MIN_ONE_COLUMN_SCALE = 0.75;
/** Заголовок режима занимает примерно две строки. */
const GROUP_HEAD_LINES = 2;

interface Group {
  mode: string;
  rows: RowModel[];
  taken: number;
}

interface Segment {
  group: Group;
  rows: RowModel[];
  /** Режим начался в предыдущем столбце. */
  continued: boolean;
}

/** Делит режимы на столбцы поровну по строкам; режим может перейти в следующий столбец. */
function splitIntoColumns(groups: Group[], count: number, headLines: number): Segment[][] {
  const total = groups.reduce((sum, group) => sum + headLines + group.rows.length, 0);
  const perColumn = Math.ceil(total / count);
  const columns: Segment[][] = [[]];
  let used = 0;
  for (const group of groups) {
    let rest = group.rows;
    let continued = false;
    while (rest.length > 0) {
      const room = perColumn - used - headLines;
      // не оставляем в конце столбца заголовок с одной-двумя строками
      if (room < Math.min(3, rest.length) && used > 0 && columns.length < count) {
        columns.push([]);
        used = 0;
        continue;
      }
      const take = columns.length < count ? Math.max(1, Math.min(rest.length, room)) : rest.length;
      columns[columns.length - 1].push({ group, rows: rest.slice(0, take), continued });
      used += headLines + take;
      rest = rest.slice(take);
      continued = true;
      if (rest.length > 0 && columns.length < count) {
        columns.push([]);
        used = 0;
      }
    }
  }
  return columns;
}

/** Что ставить, по режимам печи; внутри режима — порядок калькулятора, «Без режима» в конце. */
function groupByMode(rows: RowModel[]): Group[] {
  const groups = new Map<string, RowModel[]>();
  for (const row of rows) {
    const mode = row.item.bakingMode ?? NO_MODE;
    groups.set(mode, [...(groups.get(mode) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === NO_MODE ? 1 : b === NO_MODE ? -1 : a.localeCompare(b, "ru")))
    .map(([mode, list]) => ({ mode, rows: list, taken: list.reduce((sum, row) => sum + (row.taken ?? 0), 0) }));
}

function PrintLine({ row: { item, taken } }: { row: RowModel }) {
  const buns = item.bunsPer && taken ? bunsFor(taken, item.bunsPer) : null;
  return (
    <div className={styles.line} data-print-row>
      <span className={styles.check} aria-hidden="true" />
      <span className={styles.name}>{item.name}</span>
      <small className={styles.note}>{item.defrostMinutes ? `дефрост ${formatDuration(item.defrostMinutes)}` : ""}</small>
      {buns !== null ? (
        <small className={styles.note}>
          {buns} {plural(buns, "булка", "булки", "булок")}
        </small>
      ) : null}
      <b className={styles.count} data-print-value="taken">
        {taken}
      </b>
    </div>
  );
}

/**
 * Лист к печи, один лист A4 альбомом: только то, что ставить, крупно, с клеткой для отметки.
 * Не влезает — ужимаем; если один столбец стал бы слишком мелким, делим на два.
 */
export default function CalculatorPrintSheet({ sheet, rows, summary }: CalculatorPrintSheetProps) {
  const pageRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(1);
  const toBake = rows.filter((row) => !row.item.block && row.taken !== null && row.taken > 0);
  const groups = groupByMode(toBake);
  // у категории без режимов печи заголовок «Без режима» ничего не говорит
  const showGroups = groups.some((group) => group.mode !== NO_MODE);
  const columns = splitIntoColumns(groups, columnCount, showGroups ? GROUP_HEAD_LINES : 0);
  const printedAt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date());

  useLayoutEffect(() => {
    const fit = () => {
      if (!pageRef.current || !contentRef.current) return;
      const available = pageRef.current.clientHeight;
      const needed = contentRef.current.scrollHeight;
      const scale = needed > 0 ? Math.min(1, (available - 2) / needed) : 1;
      if (scale < MIN_ONE_COLUMN_SCALE && columnCount === 1) {
        setColumnCount(2);
        return;
      }
      contentRef.current.style.setProperty("--print-scale", String(scale));
    };
    fit();
    // шрифт мог ещё не загрузиться — тогда высота другая
    void document.fonts?.ready.then(fit);
  }, [rows, summary, columnCount]);

  return createPortal(
    <article id="calculator-print-sheet" className={styles.printSheet} aria-label="Лист калькулятора для печати" ref={pageRef}>
      <div className={styles.content} ref={contentRef}>
        <header className={styles.header}>
          <div>
            <p>
              {sheet.ttName} · {printedAt}
            </p>
            <h1>{sheet.title}</h1>
          </div>
          <div className={styles.total}>
            <p>всего</p>
            <strong>{summary.taken} шт</strong>
            {summary.buns !== null ? (
              <p>
                {summary.buns} {plural(summary.buns, "булка", "булки", "булок")}
              </p>
            ) : null}
          </div>
        </header>

        {toBake.length === 0 ? (
          <p className={styles.nothing}>Ставить нечего</p>
        ) : (
          <div className={styles.columns} data-columns={columns.length}>
            {columns.map((column, index) => (
              <div className={styles.column} key={index}>
                {column.map(({ group, rows: segmentRows, continued }) => (
                  <section className={styles.group} key={group.mode}>
                    {showGroups ? (
                      <h2 className={styles.groupTitle}>
                        <span>
                          {group.mode === NO_MODE ? group.mode : `Режим ${group.mode}`}
                          {continued ? <small> · продолжение</small> : null}
                        </span>
                        {continued ? null : <small>{group.taken} шт</small>}
                      </h2>
                    ) : null}
                    {segmentRows.map((row) => (
                      <PrintLine key={row.item.rkCode} row={row} />
                    ))}
                  </section>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </article>,
    document.body,
  );
}
