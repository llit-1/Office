import styles from "./Tile.module.css";
import { Link } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../../Store";
import type { MenuPart } from "../../menuParts/menuParts";
import { hasRequiredRole } from "../../App/access";

const Tile = ({ partData }: { partData: MenuPart }) => {
  const roles = useSelector((state: RootState) => state.userData.roles);
  const hasAccess = hasRequiredRole(roles, partData.requiredRole);

  if (hasAccess) {
    return (
      <Link to={partData.path} className={styles.tile}>
        <img src={partData.img} alt={partData.name} />
        <p>{partData.name}</p>
      </Link>
    );
  }
};

export default Tile;
