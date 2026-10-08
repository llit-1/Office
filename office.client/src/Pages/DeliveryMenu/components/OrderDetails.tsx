import { useState } from "react";
import StatusBadge from "../../../Components/StatusBadge/StatusBadge";
import type { YandexResponse } from "../deliveryRequests.types";
import { columnLabel, findRowId, findRows, formatValue, statusInfo } from "../deliveryRequests.utils";
import ResponseTable from "./ResponseTable";
import styles from "../DeliveryRequests.module.css";

type Row = Record<string, unknown>;

const isRecord = (value: unknown): value is Row => typeof value === "object" && value !== null && !Array.isArray(value);
const isRecordList = (value: unknown): value is Row[] => Array.isArray(value) && value.length > 0 && value.every(isRecord);

const ITEM_LIST_KEYS = ["items", "positions", "products", "order_items"];
const NAME_KEYS = ["name", "title"];
const QUANTITY_KEYS = ["quantity", "count", "qty"];
const PRICE_KEYS = ["base_price", "price", "cost"];
/** Поля, которые уже видны в заголовке карточки. */
const HEADER_KEYS = new Set(["status", "eats_id", "order_nr"]);

const pick = (row: Row, keys: string[]): unknown => {
  const key = Object.keys(row).find((name) => keys.includes(name.toLowerCase()));
  return key ? row[key] : undefined;
};

const toNumber = (value: unknown): number | null => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return null;
};

const money = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;

type OrderItem = { name: string; quantity: number | null; price: number | null; modifications: OrderItem[] };

function toItem(row: Row): OrderItem {
  const modifications = Object.entries(row).find(([key]) => key.toLowerCase() === "modifications")?.[1];
  return {
    name: String(pick(row, NAME_KEYS) ?? findRowId(row) ?? "Без названия"),
    quantity: toNumber(pick(row, QUANTITY_KEYS)),
    price: toNumber(pick(row, PRICE_KEYS)),
    modifications: isRecordList(modifications) ? modifications.map(toItem) : [],
  };
}

function ItemsTable({ items }: { items: OrderItem[] }) {
  // Цена позиции в ответе Яндекса — уже сумма за всё количество (3 шт. → 300 ₽), на количество не умножаем.
  // Модификаторы показываются со своей суммой и добавляются к строке; позиции «не в заказе» (0 шт.) в итог не идут.
  const lineTotal = (item: OrderItem) =>
    item.quantity === 0
      ? 0
      : (item.price ?? 0) + item.modifications.reduce((sum, mod) => sum + (mod.price ?? 0), 0);
  const total = items.reduce((sum, item) => sum + lineTotal(item), 0);
  const hasPrices = items.some((item) => item.price !== null);

  return (
    <div className={styles.tableWrap}>
      <table className={`${styles.table} ${styles.itemsTable}`}>
        <thead>
          <tr>
            <th scope="col">Позиция</th>
            <th scope="col" className={styles.num}>Кол-во</th>
            {hasPrices ? <th scope="col" className={styles.num}>Сумма</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={index} className={item.quantity === 0 ? styles.itemRemoved : undefined}>
              <td>
                <span className={styles.itemName}>{item.name}</span>
                {item.quantity === 0 ? <span className={styles.itemNote}>не в заказе (0 шт.)</span> : null}
                {item.modifications.length > 0 ? (
                  <ul className={styles.modifications}>
                    {item.modifications.map((mod, modIndex) => (
                      <li key={modIndex}>
                        + {mod.name}
                        {mod.quantity !== null && mod.quantity !== 1 ? ` × ${mod.quantity}` : ""}
                        {mod.price ? ` · ${money(mod.price)}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </td>
              <td className={styles.num}>{item.quantity ?? "—"}</td>
              {hasPrices ? <td className={styles.num}>{item.price !== null ? money(lineTotal(item)) : "—"}</td> : null}
            </tr>
          ))}
        </tbody>
        {hasPrices ? (
          <tfoot>
            <tr>
              <th scope="row" colSpan={2}>Итого по позициям</th>
              <td className={styles.num}>{money(total)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** Скалярные поля заказа — сеткой «подпись: значение»; вложенные объекты разворачиваем с префиксом. */
type Field = { key: string; column: string; label: string; value: unknown };

function collectFields(row: Row, prefix = ""): Field[] {
  const fields: Field[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (!prefix && HEADER_KEYS.has(key.toLowerCase())) continue;
    if (Array.isArray(value)) continue;
    const label = prefix ? `${prefix} · ${columnLabel(key)}` : columnLabel(key);
    if (isRecord(value) && !["code", "message", "reason"].some((name) => name in value)) {
      fields.push(...collectFields(value, label));
    } else {
      fields.push({ key: `${prefix}${key}`, column: key, label, value });
    }
  }
  return fields;
}

function OrderCard({ order }: { order: Row }) {
  const number = String(pick(order, ["eats_id", "order_nr"]) ?? findRowId(order) ?? "");
  const status = statusInfo(pick(order, ["status"]));
  const fields = collectFields(order);
  const lists = Object.entries(order).filter(([, value]) => isRecordList(value));
  const itemsEntry = lists.find(([key]) => ITEM_LIST_KEYS.includes(key.toLowerCase()));
  const otherLists = lists.filter((entry) => entry !== itemsEntry);

  return (
    <article className={styles.orderCard}>
      <header className={styles.orderHeader}>
        <span className={styles.orderNumber}>№ {number}</span>
        {status ? <StatusBadge tone={status.tone}>{status.label}</StatusBadge> : null}
      </header>

      {fields.length > 0 ? (
        <dl className={styles.fields}>
          {fields.map((field) => (
            <div key={field.key}>
              <dt title={field.column}>{field.label}</dt>
              <dd>{formatValue(field.column, field.value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {itemsEntry ? (
        <section className={styles.orderSection}>
          <h3>Состав заказа</h3>
          <ItemsTable items={(itemsEntry[1] as Row[]).map(toItem)} />
        </section>
      ) : null}

      {otherLists.map(([key, value]) => (
        <section key={key} className={styles.orderSection}>
          <h3>{columnLabel(key)}</h3>
          <ResponseTable rows={value as Row[]} />
        </section>
      ))}
    </article>
  );
}

/** Детали заказов из ответа Яндекса: карточка на каждый заказ и исходный JSON по кнопке. */
export default function OrderDetails({ response }: { response: YandexResponse }) {
  const [rawVisible, setRawVisible] = useState(false);
  const orders = findRows(response);

  return (
    <div className={styles.detailsBody}>
      {orders.length > 0
        ? orders.map((order, index) => <OrderCard key={findRowId(order) ?? index} order={order} />)
        : <p className={styles.empty}>Сервис ответил без данных о заказе.</p>}

      <button type="button" className={styles.rawToggle} onClick={() => setRawVisible((visible) => !visible)}>
        {rawVisible ? "Скрыть исходный ответ" : "Показать исходный ответ"}
      </button>
      {rawVisible ? <pre className={styles.raw}>{JSON.stringify(response, null, 2)}</pre> : null}
    </div>
  );
}
