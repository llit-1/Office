import styles from "./Main.module.css"
import Tile from "./Tile"
import { menuParts } from "../../menuParts/menuParts";
import { useDispatch } from "react-redux";
import { useEffect } from "react"
import { titleSet } from "../../Store/stateForPageTitleSlice"
import {visibleSet } from "../../Store/stateForBackButtonSlice"

const Main = () => {

  const partWithoutMainPage = menuParts.slice(1);

  const dispatch = useDispatch();

  useEffect(() => {
      dispatch(titleSet({ title: "Главная" }))
      dispatch(visibleSet({visible: false}))
  }, [dispatch]);


  return (
    <div className={styles.wrapper_tiles}>
      {partWithoutMainPage.map((elem, index) => (
        <Tile partData={elem} key={index} />
      ))}
    </div>
  )
}

export default Main