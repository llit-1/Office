import styles from "./BackArrow.module.css"
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../../Store/index";

const BackArrow: React.FC = () => {
  const navigate = useNavigate()
  const path = useSelector((state: RootState) => state.backButton.path);

  return (
    <div className={styles.backArrow_container}>
        <div className={styles.backArrow_wrapper} onClick={() => navigate(path)}>
            <ArrowBackIcon />
            <span className={styles.backArrow_text}>назад</span>
        </div>
    </div>
  )
}

export default BackArrow