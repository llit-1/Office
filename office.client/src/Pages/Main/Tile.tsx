import styles from "./Tile.module.css";
import { MenuPart } from "../../menuParts/menuParts";
import { Link } from "react-router-dom";

const iconSx = {
  width: 56,
  height: 56,
  fill: "#333333",
};

const Tile = ({ partData }: { partData: MenuPart }) => {
  const Icon = partData.Icon;

  return (
    <Link to={partData.path} className={styles.tile}>
      <Icon sx={iconSx} />
      <p>{partData.name}</p>
    </Link>
  );
};

export default Tile;