import styles from "./CalculatorCategoryTile.module.css"
import { useNavigate } from "react-router-dom";


interface CalculatorCategoryTileProps {
  title: string;
  img: string;
}


const CalculatorCategoryTile: React.FC<CalculatorCategoryTileProps> = ({title, img}) => {

  const navigate = useNavigate()

  return (
    <div className={styles.categoryTile_wrapper} onClick={() => navigate("/Calculator/SelectTT")}>
        <img className={styles.categoryTile_img} src={img}/>
        <span className={styles.categoryTile_text}>{title}</span>
    </div>
  )
}

export default CalculatorCategoryTile