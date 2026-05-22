// import styles from "./Calculate.module.css"
import { useDispatch, useSelector } from "react-redux";
import styles from "./Calculate.module.css"
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { RootState } from "../../Store/index";
import { useEffect } from "react";

const Calculate = () => {

  const dispatch = useDispatch();
  const categoryName = useSelector((state: RootState) => state.calculatorData.categoryName);

  useEffect(() => {
    dispatch(titleSet({ title: categoryName || "Калькулятор" }));
    dispatch(visibleSet({ visible: true  }));
    dispatch(pathSet({ path: "/Calculator/SelectTT" }));
  }, [dispatch, categoryName]);

  return (
    <>
      <div className={styles.calculateWrapper}>
        <div className={styles.calculate_inner}>
          
          <div className={`${styles.newRow} ${styles.headerRow}`}>
            <div className={styles.leftAlignedCell}>Наименование</div>
            <div>Время дефроста</div>
            <div>Режим выпечки</div>
            <div>Осталось</div>
            <div>План</div>
            <div>Факт</div>
          </div>

          <div className={styles.calculate_inner_tbody}>
            {[1,2,3,4,5,6,7,8, 9, 10, 11,12,13,14,15,16,17,18,19,20].map((index) => (
            <div className={styles.newRow} key={index}>
              <label>Пирожное Мусс Шоколадный</label>
              <div>60</div>
              <div>P3</div>
              <input type="text" maxLength={3} tabIndex={2} />
              <div>0</div>
              <input type="text" maxLength={3} tabIndex={3} />
            </div>
          ))}
          </div>
        </div>
      </div>
    </>
    
  )
}

export default Calculate
