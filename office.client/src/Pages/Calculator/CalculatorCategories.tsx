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
      <>
        <div className={styles.calculatorCategories_wrapper}>
          <CalculatorCategoryTile title={"Хлеб"} img={"/img/breads.svg"}/>
          <CalculatorCategoryTile title={"Выпечка"} img={"/img/bread.svg"}/>
          <CalculatorCategoryTile title={"Кондитерские изделия"} img={"/img/cake.svg"}/>
          <CalculatorCategoryTile title={"Сэндвичи"} img={"/img/sandwich.svg"}/>
          <CalculatorCategoryTile title={"Прочий ассортимент"} img={"/img/other-food.png"}/>
        </div>
      </>
    </>
    
  )
}

export default CalculatorCategories