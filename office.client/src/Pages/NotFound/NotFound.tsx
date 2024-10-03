import styles from "./NotFound.module.css"
import { useNavigate } from "react-router-dom"

const NotFound = () => {

    const redirect = useNavigate()

    const goToHome = () => {
        redirect("/Main")
    }

  return (
    <>
        <div className={styles.notFoundContainer}>
            <p>Ошибочка, тут ничего нет :(</p>
            <div className={styles.circle}> 404 </div>
            <button 
                className={styles.notFoundButton}
                onClick={goToHome}
            >Вернуться на главную страницу</button>
        </div>
    </>
  )
}

export default NotFound