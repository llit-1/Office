import { useDispatch } from "react-redux";
import styles from "./CalculatorSelectTT.module.css"
import CalculatorTile from './CalculatorTile'
import { pathSet } from "../../Store/stateForBackButtonSlice";
import { useEffect } from "react";

const CalculatorSelectTT = () => {

  const dispatch = useDispatch();

    useEffect(() => {
        dispatch(pathSet({ path: "/Calculator/SelectCategory" }));
  }, [dispatch]);



  const data: Record<number, string> = {
    1: "Тестовая ТТ",
    2: "Восстания 169",
    3: "Лиговский проспект 33",
    4: "Невский проспект 88",
    5: "Сенная площадь 15",
    6: "Пулковское шоссе 25",
    7: "Московский проспект 120",
    8: "Проспект Большевиков 19",
    9: "Комендантский проспект 25",
    10: "Выборгское шоссе 12",
    11: "Дальневосточный 45",
    12: "Ленинский проспект 50",
    13: "Проспект Ветеранов 61",
    14: "Улица Дыбенко 14",
    15: "Энгельса проспект 21"
  };

  return (
    <>
      <div className={styles.calculator_wrapper}>
        {Object.entries(data).map(([key, value]) => (
          <CalculatorTile key={key} value={value}/>
        ))}
      </div>
    </>
  )
}

export default CalculatorSelectTT