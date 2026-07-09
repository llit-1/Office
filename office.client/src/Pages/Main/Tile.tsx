import styles from "./Tile.module.css";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import type { RootState } from "../../Store";
import type { MenuPart } from "../../menuParts/menuParts";
import { hasRequiredRole } from "../../App/access";
import { preloadImage } from "../../App/assetPreload";
import { navigateWithPreloadedRoute, preloadRouteForPath } from "../../App/routes";

const Tile = ({ partData }: { partData: MenuPart }) => {
  const roles = useSelector((state: RootState) => state.userData.roles);
  const navigate = useNavigate();
  const hasAccess = hasRequiredRole(roles, partData.requiredRole);

  if (hasAccess) {
    return (
      <button
        type="button"
        className={styles.tile}
        onMouseEnter={() => {
          void preloadRouteForPath(partData.path);
          void preloadImage(partData.img);
        }}
        onFocus={() => {
          void preloadRouteForPath(partData.path);
          void preloadImage(partData.img);
        }}
        onClick={() => {
          void navigateWithPreloadedRoute(navigate, partData.path);
        }}
      >
        <img src={partData.img} alt={partData.name} />
        <p>{partData.name}</p>
      </button>
    );
  }
};

export default Tile;
