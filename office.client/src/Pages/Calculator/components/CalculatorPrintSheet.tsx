import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { bunsFor, formatDuration } from "../calculator.plan";
import type { RowModel, Summary } from "../calculator.rows";
import type { CalculatorSheet } from "../calculator.types";
import styles from "./CalculatorPrintSheet.module.css";

interface CalculatorPrintSheetProps {
  sheet: CalculatorSheet;
  rows: RowModel[];
  summary: Summary;
}

export default function CalculatorPrintSheet({ sheet, rows, summary }: CalculatorPrintSheetProps) {
  const pageRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hasBuns = sheet.slug === "sandwiches";
  const columnCount = rows.length > 12 ? 2 : 1;
  const rowsPerColumn = Math.ceil(rows.length / columnCount);
  const columns = Array.from({ length: columnCount }, (_, index) =>
    rows.slice(index * rowsPerColumn, (index + 1) * rowsPerColumn));
  const printedAt = new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" }).format(new Date());

  useLayoutEffect(() => {
    if (!pageRef.current || !contentRef.current) return;
    const available = pageRef.current.clientHeight;
    const needed = contentRef.current.scrollHeight;
    const scale = needed > 0 ? Math.min(1, (available - 2) / needed) : 1;
    contentRef.current.style.setProperty("--print-scale", String(scale));
  }, [rows, summary]);

  return createPortal(
    <article id="calculator-print-sheet" className={styles.printSheet} aria-label="Лист калькулятора для печати" ref={pageRef}>
      <div className={styles.content} ref={contentRef}>
        <header className={styles.header}>
          <h1>{sheet.title}</h1>
          <p>{sheet.ttName} · {printedAt}</p>
        </header>

        <div className={styles.summary}>
          <span>Заполнено <strong>{summary.entered} из {summary.total}</strong></span>
          <span>План <strong>{summary.plan}</strong></span>
          <span>Факт <strong>{summary.taken}</strong></span>
          {hasBuns ? <span>Булок <strong>{summary.buns ?? 0}</strong></span> : null}
        </div>

        <div className={styles.columns} data-columns={columnCount}>
          {columns.map((column, index) => (
            <div className={styles.column} key={index}>
              <div className={styles.columnHead} data-sandwich={hasBuns || undefined}>
                <span>Позиция</span>
                <span>Осталось</span>
                <span>План</span>
                <span>Факт</span>
                {hasBuns ? <span>Булок</span> : null}
              </div>
              {column.map((row) => {
                const { item, entry, plan, taken } = row;
                const notes = item.block
                  ? ["Не в работе", item.block.text]
                  : [
                    item.bakingMode ? `Режим ${item.bakingMode}` : null,
                    item.defrostMinutes ? `Дефрост ${formatDuration(item.defrostMinutes)}` : null,
                    item.bunsPer ? `${item.bunsPer} шт. из булки` : null,
                  ].filter(Boolean);

                return (
                  <section className={styles.item} key={item.rkCode} data-print-row>
                    <div className={styles.itemInfo}>
                      <strong className={styles.itemName}>{item.name}</strong>
                      {notes.length ? <small className={styles.notes}>{notes.join(" · ")}</small> : null}
                    </div>
                    <div className={styles.values} data-sandwich={hasBuns || undefined}>
                      <b data-print-value="rest">{entry.rest === "" ? "—" : entry.rest}</b>
                      <b data-print-value="plan">{plan ?? "—"}</b>
                      <b data-print-value="fact">{entry.fact === "" ? "—" : entry.fact}</b>
                      {hasBuns ? <b data-print-value="buns">{item.bunsPer && taken !== null ? bunsFor(taken, item.bunsPer) : "—"}</b> : null}
                    </div>
                  </section>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </article>,
    document.body,
  );
}
