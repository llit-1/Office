import styles from "./Main.module.css";
import Tile from "./Tile";
import { menuParts } from "../../menuParts/menuParts";
import { useDispatch } from "react-redux";
import { useEffect } from "react";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { visibleSet } from "../../Store/stateForBackButtonSlice";

const Main = () => {
  const dispatch = useDispatch();
  const partWithoutMainPage = menuParts.slice(1);

  useEffect(() => {
    dispatch(titleSet({ title: "Главная" }));
    dispatch(visibleSet({ visible: false }));
  }, [dispatch]);

  return (
    <div className={styles.wrapper_tiles}>
      {partWithoutMainPage.map((elem) => (
        <Tile partData={elem} key={elem.path} />
      ))}
    </div>
  );
};

export default Main;
