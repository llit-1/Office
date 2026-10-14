import { useCallback } from "react";
import EditRoundedIcon from "@mui/icons-material/EditRounded";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import ScheduleRoundedIcon from "@mui/icons-material/ScheduleRounded";
import Button from "../../../Components/Button/Button";
import LoadingSpinner from "../../../Components/LoadingSpinner/LoadingSpinner";
import Modal from "../../../Components/Modal/Modal";
import StatePanel from "../../../Components/StatePanel/StatePanel";
import { getOrderLines } from "../orders.api";
import { formatDelivery, formatMoment, formatQuantity, formatTimeLeft, positionsLabel } from "../orders.format";
import { canEditOrder, isOrderOpen, serverMoment } from "../orders.rules";
import type { Order, OrderRule, OrdersPermissions } from "../orders.types";
import { useLoader } from "../useOrdersBase";
import shared from "../Orders.module.css";
import styles from "./OrderDetails.module.css";

interface OrderDetailsModalProps {
  order: Order;
  rule: OrderRule;
  permissions: OrdersPermissions;
  now: Date;
  onClose: () => void;
  onEdit: (order: Order) => void;
}

export default function OrderDetailsModal({ order, rule, permissions, now, onClose, onEdit }: OrderDetailsModalProps) {
  // состав — что и сколько — запрашивается при открытии карточки
  const loadLines = useCallback(() => getOrderLines(order.id), [order.id]);
  const { data: lines, error, reload } = useLoader(loadLines);

  const open = isOrderOpen(order, now);
  const closeAt = serverMoment(order.creationDateTime);
  const delivery = order.shipmentDateTime ? formatDelivery(order.shipmentDateTime, now) : null;
  const editable = canEditOrder(order, now, permissions);
  const timeLeft = formatTimeLeft(closeAt, now);

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      closeOnBackdropClick
      title={`Заказ № ${order.id}`}
      panelClassName={styles.panel}
      bodyClassName={styles.body}
    >
      <div className={styles.scroll}>
        <dl className={styles.meta}>
          <div><dt>Тип заказа</dt><dd>{rule.name}</dd></div>
          <div><dt>Торговая точка</dt><dd>{order.storeName}</dd></div>
          <div><dt>Дата формирования</dt><dd>{formatMoment(order.creationDateTime)}</dd></div>
          <div>
            <dt>Доставка</dt>
            <dd>{delivery ? <>{delivery.date}{delivery.relative ? <span className={shared.muted}> · {delivery.relative}</span> : null}</> : "—"}</dd>
          </div>
          {order.userName ? <div><dt>Оформил</dt><dd>{order.userName}</dd></div> : null}
        </dl>

        {open ? (
          <p className={shared.notice}>
            <ScheduleRoundedIcon />
            <span>Изменения принимаются до {formatMoment(closeAt)}{timeLeft ? ` — осталось ${timeLeft}` : ""}.</span>
          </p>
        ) : (
          <p className={`${shared.notice} ${shared.noticeWarning}`}>
            <LockOutlinedIcon />
            <span>Заказ сформирован {formatMoment(closeAt)} и больше не меняется.</span>
          </p>
        )}

        {!lines ? (
          error ? (
            <StatePanel
              tone="error"
              icon={<ErrorOutlineRoundedIcon />}
              title="Состав заказа не загрузился"
              text="Проверьте соединение и повторите попытку."
              action={<Button variant="primary" onClick={() => void reload()}>Повторить</Button>}
            />
          ) : <div className={shared.loading}><LoadingSpinner size={56} label="Загружаем состав…" /></div>
        ) : (
          <div className={styles.lines} role="table" aria-label="Состав заказа">
            <div className={styles.linesHead} role="row">
              <span role="columnheader">Позиция</span>
              <span role="columnheader">Кол-во</span>
            </div>
            {lines.map((line) => (
              <div key={line.itemId} className={styles.line} role="row">
                <div role="cell" className={styles.lineName}>
                  <span>{line.name}</span>
                  {line.rkcode !== null ? <small>{line.rkcode}</small> : null}
                </div>
                <span role="cell" className={shared.numeric}>{line.quantity === null ? "—" : formatQuantity(line.quantity)}</span>
              </div>
            ))}
            <div className={styles.linesTotal} role="row">
              <span role="cell">{positionsLabel(lines.length)}</span>
              <span role="cell" />
            </div>
          </div>
        )}
      </div>

      {editable ? (
        <div className={styles.actions}>
          <Button variant="primary" leadingIcon={<EditRoundedIcon />} onClick={() => onEdit(order)}>Изменить</Button>
        </div>
      ) : null}
    </Modal>
  );
}
