import { useDispatch } from "react-redux";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice"
import styles from "./CalculatorCategories.module.css"
import CalculatorCategoryTile from "./CalculatorCategoryTile"
import { useEffect } from "react";

const CalculatorCategories = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(pathSet({ path: "/Main" }));
    dispatch(titleSet({ title: "Калькуляторы розницы" }))
  }, [dispatch]);

  return (
    
    <>
      <div className={styles.calculatorCategories_wrapper}>
          <CalculatorCategoryTile title={"Хлеб"} img={"/img/breads.svg"} categoryId={0}/>
          <CalculatorCategoryTile title={"Выпечка"} img={"/img/bread.svg"} categoryId={1}/>
          <CalculatorCategoryTile title={"Кондитерские изделия"} img={"/img/cake.svg"} categoryId={2}/>
          <CalculatorCategoryTile title={"Сэндвичи"} img={"/img/sandwich.svg"} categoryId={3}/>
          <CalculatorCategoryTile title={"Прочий ассортимент"} img={"/img/other-food.png"} categoryId={4}/>
      </div>
    </>

  )
} 
export default CalculatorCategories