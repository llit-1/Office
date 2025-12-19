import styles from "./CalculatorCategoryTile.module.css"
import { useNavigate } from "react-router-dom";
import { useDispatch } from "react-redux"
import { setIdCategory, setCategoryName } from "../../Store/calculatorSlice"

interface CalculatorCategoryTileProps {
  title: string;
  img: string;
  categoryId: number;
}


const CalculatorCategoryTile: React.FC<CalculatorCategoryTileProps> = ({title, img, categoryId}) => {
  const dispatch = useDispatch();
  const navigate = useNavigate()

  const categoryPicker = () => {
    dispatch(setIdCategory(categoryId))
    navigate("/Calculator/SelectTT")
    dispatch(setCategoryName(title))
  }

  return (
    <div className={styles.categoryTile_wrapper} onClick={() => categoryPicker()}>
        <img className={styles.categoryTile_img} src={img}/>
        <span className={styles.categoryTile_text}>{title}</span>
    </div>
  )
}

export default CalculatorCategoryTile