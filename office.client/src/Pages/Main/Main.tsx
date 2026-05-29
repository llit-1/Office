import styles from "./Main.module.css";
import Tile from "./Tile";
import { menuParts } from "../../menuParts/menuParts";
import { useDispatch, useSelector } from "react-redux";
import { useEffect } from "react";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { visibleSet } from "../../Store/stateForBackButtonSlice";
import type { RootState } from "../../Store";
import { getAvailableMenuParts } from "../../App/access";

const Main = () => {
  const dispatch = useDispatch();
  const roles = useSelector((state: RootState) => state.userData.roles);
  const partWithoutMainPage = getAvailableMenuParts(menuParts, roles).slice(1);

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
