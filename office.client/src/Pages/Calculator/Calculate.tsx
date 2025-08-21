// import styles from "./Calculate.module.css"
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import arrow from "../../Components/BackArrow/BackArrow.module.css"
import styles from "./Calculate.module.css"

interface CalculateProps {
  switchState: React.Dispatch<React.SetStateAction<number>>;
}

const Calculate : React.FC<CalculateProps> = ({switchState}) => {

  return (
    <>
      <div className={arrow.backArrow_container}>
        <div className={arrow.backArrow_wrapper} onClick={() => switchState(2)}>
          <ArrowBackIcon />
          <span className={arrow.backArrow_text}>назад</span>
        </div>
      </div>

      <div className={styles.calculate_wrapper}>
        <div className={styles.calculate_about}>
          <div className={styles.calculate_about}>
            <span>Калькулятор Хлеба</span>
            <span>Тестовая ТТ</span>
            <span>Кургузов Владислав</span>
            <span>06.02.2025 15:30:00</span>
          </div>
          <img className={styles.calculate_img} src='img/bread.svg'/>
        </div>
        <table className={styles.calculate_table}>
          <thead>
              <tr>
                  <th>№</th>
                  <th>Наименование</th>
                  <th>Время дефроста</th>
                  <th>Режим выпечки</th>
                  <th>Осталось</th>
                  <th>План</th>
                  <th>Факт</th>
              </tr>
          </thead>
          <tbody>
            { [1,2,3,4,5,6,7,8].map((key, index) => (
              <tr key={key} className={index % 2 === 0 ? "" : styles.even}>
                <td>{index + 1}</td>
                <td>Булка </td>
                <td>35</td>
                <td>Р3</td>
                <td>
                    <input type='text' maxLength={3} tabIndex={index + 1}/>
                </td>
                <td>0</td>                           
                <td>
                    <input type="text" maxLength={3} tabIndex={index + 2}/>
                </td>
              </tr>
            )) }
            
          </tbody>
        </table>
      </div>
    </>
    
  )
}

export default Calculate