import styles from "./CalculatorSelectTT.module.css"
import CalculatorTile from './CalculatorTile'
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import arrow from "../../Components/BackArrow/BackArrow.module.css"

interface CalculatorSelectTTProps {
  switchState: React.Dispatch<React.SetStateAction<number>>;
}


const CalculatorSelectTT : React.FC<CalculatorSelectTTProps> = ({switchState}) => {


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
      <div className={arrow.backArrow_container}>
        <div className={arrow.backArrow_wrapper} onClick={() => switchState(1)}>
          <ArrowBackIcon />
          <span className={arrow.backArrow_text}>назад</span>
        </div>
      </div>

      <div className={styles.calculator_wrapper}>
        {Object.entries(data).map(([key, value]) => (
          <CalculatorTile switchState={switchState} key={key} value={value}/>
        ))}
      </div>
    </>
  )
}

export default CalculatorSelectTT