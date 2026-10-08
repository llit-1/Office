import Checkbox from "../../../Components/Checkbox/Checkbox";
import StatusBadge from "../../../Components/StatusBadge/StatusBadge";
import { columnLabel, columnsOf, findRowId, formatValue, statusInfo } from "../deliveryRequests.utils";
import styles from "../DeliveryRequests.module.css";

type Selection = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

type ResponseTableProps = {
  rows: Record<string, unknown>[];
  /** Поля, которые не несут пользы в таблице (например, GUID точки у каждого заказа). */
  hiddenColumns?: string[];
  selection?: Selection;
  onRowClick?: (row: Record<string, unknown>) => void;
  rowLabel?: (row: Record<string, unknown>) => string;
};

/**
 * Таблица по ответу Яндекса. Формат ответов нигде не описан, поэтому колонки берутся из самих данных;
 * известным полям даём русские подписи, статусы красим.
 */
export default function ResponseTable({ rows, hiddenColumns = [], selection, onRowClick, rowLabel }: ResponseTableProps) {
  const hidden = new Set(hiddenColumns.map((column) => column.toLowerCase()));
  const columns = columnsOf(rows).filter((column) => !hidden.has(column.toLowerCase()));
  const selectedSet = new Set(selection?.selectedIds ?? []);
  const selectableIds = selection ? rows.map(findRowId).filter((id): id is string => id !== null) : [];
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedSet.has(id));

  const toggle = (id: string, checked: boolean) => {
    if (!selection) return;
    selection.onChange(checked
      ? [...selection.selectedIds, id]
      : selection.selectedIds.filter((value) => value !== id));
  };

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {selection ? (
              <th scope="col" className={styles.selectCell}>
                {selectableIds.length > 0 ? (
                  <Checkbox
                    label="Выбрать все"
                    labelClassName={styles.srOnlyLabel}
                    checked={allSelected}
                    onChange={(event) => selection.onChange(event.target.checked ? selectableIds : [])}
                  />
                ) : null}
              </th>
            ) : null}
            {columns.map((column) => <th key={column} scope="col" title={column}>{columnLabel(column)}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const id = findRowId(row);
            const clickable = Boolean(onRowClick);
            return (
              <tr
                key={id ?? index}
                className={clickable ? styles.clickableRow : undefined}
                onClick={clickable ? () => onRowClick?.(row) : undefined}
                onKeyDown={clickable ? (event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onRowClick?.(row);
                  }
                } : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={clickable && rowLabel ? rowLabel(row) : undefined}
              >
                {selection ? (
                  <td className={styles.selectCell} onClick={(event) => event.stopPropagation()}>
                    {id ? (
                      <Checkbox
                        label={`Выбрать ${id}`}
                        labelClassName={styles.srOnlyLabel}
                        checked={selectedSet.has(id)}
                        onChange={(event) => toggle(id, event.target.checked)}
                      />
                    ) : null}
                  </td>
                ) : null}
                {columns.map((column) => {
                  const status = column.toLowerCase() === "status" ? statusInfo(row[column]) : null;
                  return (
                    <td key={column}>
                      {status ? <StatusBadge tone={status.tone} title={String(row[column])}>{status.label}</StatusBadge> : formatValue(column, row[column])}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
