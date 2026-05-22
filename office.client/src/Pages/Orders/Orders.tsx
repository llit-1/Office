import { useEffect, useMemo, useState } from "react";
import styles from "./Orders.module.css";
import { useDispatch } from "react-redux";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import CustomSelect from "./CustomSelect";

const Orders = () => {
  const dispatch = useDispatch();
  const [ttFilter, setTtFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("current");
  const [state, setState] = useState(false);

  const ttOptions = useMemo(
    () => [
      { value: "all", label: "Все ТТ" },
      { value: "1", label: "Филиал 1" },
      { value: "2", label: "Филиал 2" },
      { value: "3", label: "Филиал 3" },
    ],
    []
  );

  const periodOptions = useMemo(
    () => [
      { value: "current", label: "Текущие заказы" },
      { value: "w1", label: "Неделя 1" },
      { value: "w2", label: "Неделя 2" },
      { value: "w3", label: "Неделя 3" },
    ],
    []
  );

  useEffect(() => {
    dispatch(titleSet({ title: "Заказы ТТ" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(pathSet({ path: "/" }));
  }, [dispatch]);

  return (
    <div className={styles.orderWrapper}>
      <div className={styles.orderTypeWrapper}>
        <div className={`${styles.orderType} ${styles.selected}`}>Еженедельный заказ</div>
        <div className={styles.orderType}>Ежемесячный заказ</div>
        <div className={styles.orderType}>Регулярный заказ</div>
        <div className={styles.orderType}>Заказ ценников</div>
      </div>

      <div className={styles.orderBody}>
        <div className={styles.settingOrderBody}>
          <div className={styles.filters}>
            <CustomSelect options={ttOptions} value={ttFilter} onChange={setTtFilter} />
            <CustomSelect options={periodOptions} value={periodFilter} onChange={setPeriodFilter} />
          </div>
          <button className={styles.createOrderBtn} onClick={() => setState(!state)}>Создать заказ</button>
        </div>

        <div className={`${styles.orderList} ${state ? styles.orderListExpanded : ""}`}>
            {[1,2,3,4,5,6,7,8,9,11,12,13,14,15,16,17,18,19,21,23,22,23].map((key) => (
                <div className={styles.ttCard} key={key}>
                    <span>ТТ: Филиал 1</span>
                    <span>Кол-во заказов: 2</span>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default Orders;
