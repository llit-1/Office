import styles from "./NotFound.module.css"
import { useNavigate } from "react-router-dom"
import Button from "../../Components/Button/Button"

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
            <Button
                variant="secondary"
                onClick={goToHome}
            >Вернуться на главную страницу</Button>
        </div>
    </>
  )
}

export default NotFound
