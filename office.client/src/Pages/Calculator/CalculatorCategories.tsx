import { useDispatch } from "react-redux";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice"
import styles from "./CalculatorCategories.module.css"
import CalculatorCategoryTile from "./CalculatorCategoryTile"
import { useState, useEffect } from "react";
import CalculatorSelectTT from "./CalculatorSelectTT"
import Calculate from "./Calculate"

const CalculatorCategories = () => {
  // Шаг 1 = выбор категории
  // Шаг 2 - выбор точки
  // Шаг 3 - заполнение
  const [stage, setStage] = useState<number>(1)

  const dispatch = useDispatch();

    useEffect(() => {
        dispatch(visibleSet({ visible: true }));
        dispatch(pathSet({ path: "/Main" }));
        dispatch(titleSet({ title: "Калькулятор" }))
  }, [dispatch]);

  return (
    <>
        { stage == 1 && 
          <>
            <div className={styles.calculatorCategories_wrapper}>
              <CalculatorCategoryTile switchState={setStage} title={"Хлеб"} img={"/img/breads.svg"}/>
              <CalculatorCategoryTile switchState={setStage} title={"Выпечка"} img={"/img/bread.svg"}/>
              <CalculatorCategoryTile switchState={setStage} title={"Кондитерские изделия"} img={"/img/cake.svg"}/>
              <CalculatorCategoryTile switchState={setStage} title={"Сэндвичи"} img={"/img/sandwich.svg"}/>
              <CalculatorCategoryTile switchState={setStage} title={"Прочий ассортимент"} img={"/img/other-food.png"}/>
            </div>
          </>
        }

        { stage == 2 &&
          <CalculatorSelectTT switchState={setStage}/>
        }

        { stage == 3 && 
          <Calculate switchState={setStage}/>
        }

    </>
    
  )
}

export default CalculatorCategories