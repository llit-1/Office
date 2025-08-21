import styles from "./CalculatorCategoryTile.module.css"

interface CalculatorCategoryTileProps {
  title: string;
  img: string;
  switchState: React.Dispatch<React.SetStateAction<number>>;
}


const CalculatorCategoryTile: React.FC<CalculatorCategoryTileProps> = ({title, img, switchState}) => {

  return (
    <div className={styles.categoryTile_wrapper} onClick={() => switchState(2)}>
        <img className={styles.categoryTile_img} src={img}/>
        <span className={styles.categoryTile_text}> {title} </span>
    </div>
  )
}

export default CalculatorCategoryTile