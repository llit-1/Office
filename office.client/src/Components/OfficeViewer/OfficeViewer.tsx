import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import LoadingSpinner from "../LoadingSpinner/LoadingSpinner";
import { loadOfficeDocument } from "./loadOfficeDocument";
import { getOfficeViewerFormat } from "./officeFormats";
import type { OfficeDocument, SheetCell } from "./officeViewer.types";
import styles from "./OfficeViewer.module.css";

interface OfficeViewerProps {
  url: string;
  extension: string;
  fileName: string;
  downloadUrl?: string;
}

function columnLabel(index: number) {
  let label = "";
  let value = index;
  while (value >= 0) {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  }
  return label;
}

function cellStyle(cell: SheetCell): CSSProperties {
  const style: CSSProperties = {};
  if (cell.bold) style.fontWeight = 700;
  if (cell.italic) style.fontStyle = "italic";
  if (cell.underline && cell.strike) style.textDecoration = "underline line-through";
  else if (cell.underline) style.textDecoration = "underline";
  else if (cell.strike) style.textDecoration = "line-through";

  style.textAlign = cell.align ?? (cell.numeric ? "right" : "left");
  if (cell.verticalAlign) style.verticalAlign = cell.verticalAlign;
  if (cell.wrap) style.whiteSpace = "pre-wrap";

  if (cell.rotation) style.whiteSpace = "normal";
  if (cell.color) style.color = cell.color;
  if (cell.background) style.backgroundColor = cell.background;
  // Кегль Excel задан в пунктах.
  if (cell.fontSize) style.fontSize = `${Math.round((cell.fontSize * 96) / 72 * 10) / 10}px`;
  if (cell.fontFamily) style.fontFamily = cell.fontFamily;
  if (cell.borderTop) style.borderTop = cell.borderTop;
  if (cell.borderRight) style.borderRight = cell.borderRight;
  if (cell.borderBottom) style.borderBottom = cell.borderBottom;
  if (cell.borderLeft) style.borderLeft = cell.borderLeft;
  return style;
}

/**
 * Поворот применяем к внутреннему span, а не к ячейке: transform на display:table-cell
 * ведёт себя в браузерах непредсказуемо.
 * OOXML: 0–90 — против часовой стрелки, 91–180 — по часовой (значение минус 90), 255 — «столбиком».
 */
function rotationStyle(rotation: number): CSSProperties {
  const style: CSSProperties = { display: "inline-block" };

  if (rotation === 255) {
    style.writingMode = "vertical-rl";
    style.textOrientation = "upright";
  } else if (rotation === 90) {
    style.writingMode = "vertical-rl";
    style.transform = "rotate(180deg)";
  } else if (rotation > 90 && rotation <= 180) {
    style.writingMode = "vertical-rl";
    if (rotation !== 180) style.transform = `rotate(${rotation - 180}deg)`;
  } else {
    style.transform = `rotate(${-rotation}deg)`;
  }
  return style;
}

export default function OfficeViewer({ url, extension, fileName, downloadUrl }: OfficeViewerProps) {
  const [document, setDocument] = useState<OfficeDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeSheet, setActiveSheet] = useState(0);
  const objectUrlsRef = useRef<string[]>([]);

  const format = useMemo(() => getOfficeViewerFormat(extension), [extension]);

  useEffect(() => {
    let cancelled = false;
    setDocument(null);
    setError(null);
    setActiveSheet(0);
    setLoading(true);

    if (!format) {
      setError("Формат не поддерживается для предпросмотра.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error("Не удалось загрузить файл.");
        const buffer = await response.arrayBuffer();
        const parsed = await loadOfficeDocument(buffer, format, fileName);
        if (cancelled) {
          if (parsed.kind === "document") parsed.objectUrls.forEach((item) => URL.revokeObjectURL(item));
          return;
        }
        if (parsed.kind === "document") objectUrlsRef.current = parsed.objectUrls;
        setDocument(parsed);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Не удалось открыть файл.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      objectUrlsRef.current.forEach((item) => URL.revokeObjectURL(item));
      objectUrlsRef.current = [];
    };
  }, [fileName, format, url]);

  if (loading) {
    return (
      <div className={styles.state}>
        <LoadingSpinner label="Готовим предпросмотр…" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className={styles.state}>
        <ErrorOutlineRoundedIcon className={styles.stateIcon} />
        <p>{error ?? "Не удалось открыть файл."}</p>
        {downloadUrl && (
          <a className={styles.stateAction} href={downloadUrl}>
            <DownloadRoundedIcon fontSize="small" /> Скачать файл
          </a>
        )}
      </div>
    );
  }

  if (document.kind === "text") {
    return (
      <div className={styles.scroller}>
        <pre className={styles.plainText}>{document.text}</pre>
      </div>
    );
  }

  if (document.kind === "document") {
    return (
      <div className={styles.scroller}>
        {document.plainTextOnly && (
          <div className={styles.hint}>
            Старый формат Word — показан текст без оформления. Для полной вёрстки скачайте файл.
          </div>
        )}
        <article
          className={styles.page}
          style={{
            fontFamily: document.fontFamily,
            fontSize: document.fontSize ? `${document.fontSize}px` : undefined,
          }}
          dangerouslySetInnerHTML={{ __html: document.html }}
        />
      </div>
    );
  }

  const sheet = document.sheets[Math.min(activeSheet, document.sheets.length - 1)];

  return (
    <div className={styles.workbook}>
      {document.sheets.length > 1 && (
        <div className={styles.sheetTabs} role="tablist">
          {document.sheets.map((item, index) => (
            <button
              key={`${item.name}-${index}`}
              type="button"
              role="tab"
              aria-selected={index === activeSheet}
              className={`${styles.sheetTab} ${index === activeSheet ? styles.sheetTabActive : ""}`}
              onClick={() => setActiveSheet(index)}
            >
              {item.name}
            </button>
          ))}
        </div>
      )}

      {sheet.truncated && (
        <div className={styles.hint}>Показана только часть листа. Полные данные — в скачанном файле.</div>
      )}

      <div className={styles.gridScroller}>
        <table
          className={styles.grid}
          style={{
            fontFamily: sheet.defaultFont,
            fontSize: sheet.defaultFontSize ? `${sheet.defaultFontSize}px` : undefined,
          }}
        >
          <colgroup>
            <col className={styles.headColumn} />
            {Array.from({ length: sheet.columnCount }, (_, index) => {
              const width = sheet.columnWidths?.[index] ?? sheet.defaultColumnWidth ?? 64;
              return (
                <col
                  key={index}
                  style={{ width: `${width}px` }}
                  className={width === 0 ? styles.hiddenColumn : undefined}
                />
              );
            })}
          </colgroup>
          <thead>
            <tr>
              <th className={styles.corner} />
              {Array.from({ length: sheet.columnCount }, (_, index) => (
                <th key={index} className={styles.columnHead}>{columnLabel(index)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sheet.rows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                style={{ height: `${sheet.rowHeights?.[rowIndex] ?? sheet.defaultRowHeight ?? 20}px` }}
              >
                <th className={styles.rowHead}>{rowIndex + 1}</th>
                {row.map((cell, columnIndex) =>
                  cell.hidden ? null : (
                    <td
                      key={columnIndex}
                      style={cellStyle(cell)}
                      colSpan={cell.colSpan && cell.colSpan > 1 ? cell.colSpan : undefined}
                      rowSpan={cell.rowSpan && cell.rowSpan > 1 ? cell.rowSpan : undefined}
                    >
                      {cell.rotation
                        ? <span style={rotationStyle(cell.rotation)}>{cell.text}</span>
                        : cell.text}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
