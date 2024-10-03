import styles from "./Main.module.css"
import Tile from "./Tile"
import { menuParts } from "../../menuParts/menuParts";
const Main = () => {

  const partWithoutMainPage = menuParts.slice(1);

  return (
    <div className={styles.wrapper_tiles}>
      {partWithoutMainPage.map((elem, index) => (
        <Tile partData={elem} key={index} />
      ))}
    </div>
  )
}

export default Main