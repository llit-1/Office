import { useMemo } from "react";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import Button from "../../../Components/Button/Button";
import Modal from "../../../Components/Modal/Modal";
import StatusBadge from "../../../Components/StatusBadge/StatusBadge";
import type { Actor } from "../orders.api";
import {
  formatDateTime,
  formatDelivery,
  formatMoment,
  formatMoney,
  formatPrice,
  formatQuantity,
  formatTimeLeft,
  positionsLabel,
  statusHints,
  statusLabels,
  statusTones,
} from "../orders.format";
import { canCancelOrder, canEditOrder, getOrderStatus, orderTotals } from "../orders.rules";
import type { Order, OrderTypeConfig } from "../orders.types";
import shared from "../Orders.module.css";
import styles from "./OrderDetails.module.css";

interface OrderDetailsModalProps {
  order: Order;
  type: OrderTypeConfig;
  /** Все заказы — по ним считается объём позиции за месяц. */
  orders: Order[];
  actor: Actor;
  now: Date;
  onClose: () => void;
  onEdit: (order: Order) => void;
  onRepeat: (order: Order) => void;
  onCancel: (order: Order) => void;
}

export default function OrderDetailsModal({ order, type, orders, actor, now, onClose, onEdit, onRepeat, onCancel }: OrderDetailsModalProps) {
  const status = getOrderStatus(order, now);
  const totals = orderTotals(order.lines);
  const delivery = formatDelivery(order.deliveryDate, now);
  const closeAt = Date.parse(order.closeAt);
  const editable = canEditOrder(order, now, actor.permissions);
  const cancellable = canCancelOrder(order, now, actor.permissions);
  const priced = totals.sum !== null;

  // сколько каждой позиции эта ТТ заказала по вкладке в месяце доставки
  const monthVolume = useMemo(() => {
    const month = order.deliveryDate.slice(0, 7);
    const volume = new Map<string, number>();
    for (const other of orders) {
      if (other.storeId !== order.storeId || other.typeId !== order.typeId || other.cancelledAt || other.deliveryDate.slice(0, 7) !== month) continue;
      for (const line of other.lines) volume.set(line.article, (volume.get(line.article) ?? 0) + line.quantity);
    }
    return volume;
  }, [order, orders]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      closeOnBackdropClick
      title={`Заказ № ${order.id}`}
      panelClassName={styles.panel}
      bodyClassName={styles.body}
      headerActions={<StatusBadge tone={statusTones[status]} title={statusHints[status]}>{statusLabels[status]}</StatusBadge>}
    >
      <div className={styles.scroll}>
        <dl className={styles.meta}>
          <div><dt>Вкладка</dt><dd>{type.name}</dd></div>
          <div><dt>Торговая точка</dt><dd>{order.storeName}</dd></div>
          <div>
            <dt>Доставка</dt>
            <dd>{delivery.date}{delivery.relative ? <span className={shared.muted}> · {delivery.relative}</span> : null}</dd>
          </div>
          <div><dt>Оформил</dt><dd>{order.createdBy.name}<span className={shared.muted}> · {formatDateTime(order.createdAt)}</span></dd></div>
          {order.cancelledAt ? (
            <div><dt>Отменил</dt><dd>{order.cancelledBy?.name}<span className={shared.muted}> · {formatDateTime(order.cancelledAt)}</span></dd></div>
          ) : null}
        </dl>

        {status === "open" ? (
          <p className={shared.notice}>
            <ScheduleRoundedIcon />
            <span>Изменения принимаются до {formatMoment(closeAt)}{formatTimeLeft(closeAt, now) ? ` — осталось ${formatTimeLeft(closeAt, now)}` : ""}.</span>
          </p>
        ) : status === "locked" ? (
          <p className={`${shared.notice} ${shared.noticeWarning}`}>
            <LockOutlinedIcon />
            <span>Приём изменений закрыт {formatMoment(closeAt)}: заказ передан в работу.</span>
          </p>
        ) : null}

        <div className={styles.lines} role="table" aria-label="Состав заказа">
          <div className={styles.linesHead} role="row">
            <span role="columnheader">Позиция</span>
            <span role="columnheader">Кол-во</span>
            {priced ? <span role="columnheader">Сумма</span> : null}
          </div>
          {order.lines.map((line) => (
            <div key={line.article} className={styles.line} role="row">
              <div role="cell" className={styles.lineName}>
                <span>{line.name}</span>
                <small>
                  {line.article}{line.groupName ? ` · ${line.groupName}` : ""} · за месяц {formatQuantity(monthVolume.get(line.article) ?? line.quantity)}
                </small>
              </div>
              <span role="cell" className={shared.numeric}>{formatQuantity(line.quantity)}</span>
              {priced ? (
                <div role="cell" className={styles.lineSum}>
                  {line.price === null ? <small>цена не указана</small> : (
                    <>
                      <span className={shared.numeric}>{formatMoney(line.price * line.quantity)}</span>
                      <small className={shared.numeric}>{formatPrice(line.price)} за ед.</small>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ))}
          <div className={styles.linesTotal} role="row">
            <span role="cell">{positionsLabel(totals.positions)}</span>
            <span role="cell" />
            {priced ? <span role="cell" className={shared.numeric}>{formatMoney(totals.sum ?? 0)}</span> : null}
          </div>
          {priced && totals.unpriced > 0 ? (
            <p className={styles.footnote}>Сумма по последним ценам отгрузки. Без цены: {positionsLabel(totals.unpriced)}.</p>
          ) : null}
        </div>
      </div>

      {actor.permissions.canEdit ? (
        <div className={styles.actions}>
          {cancellable ? <Button variant="ghost" className={styles.cancelAction} onClick={() => onCancel(order)}>Отменить заказ</Button> : null}
          <Button variant={editable ? "secondary" : "primary"} leadingIcon={<ContentCopyRoundedIcon />} onClick={() => onRepeat(order)}>Повторить</Button>
          {editable ? <Button variant="primary" leadingIcon={<EditRoundedIcon />} onClick={() => onEdit(order)}>Изменить</Button> : null}
        </div>
      ) : null}
    </Modal>
  );
}
