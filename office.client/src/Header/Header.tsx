import styles from "./Header.module.css"
import { useSelector } from "react-redux";
import { RootState } from "../Store/index";
import { useNavigate } from "react-router-dom"
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';

const Header = () => {
    const title = useSelector((state: RootState) => state.pageTitle.title);
    const visible = useSelector((state: RootState) => state.backButton.visible);
    const path = useSelector((state: RootState) => state.backButton.path)

  const navigate = useNavigate()

  return (
      <header className={styles.header}>
          {visible && <div className={styles.button_back} onClick={() => navigate(path)}> <ArrowBackIosNewIcon /> </div>}
          <div className={styles.header_title} onClick={() => navigate("/Main")}>{title}</div>
          <div className={styles.header_logo}></div>
    </header>
  )
}

export default Header