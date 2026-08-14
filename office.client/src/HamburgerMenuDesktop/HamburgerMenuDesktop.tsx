import styles from "./HamburgerMenuDesktop.module.css";
import React, { useEffect, useMemo, useState } from "react";
import { menuParts } from "../menuParts/menuParts";
import { useSelector } from "react-redux";
import { Link, useNavigate, useLocation } from "react-router-dom";
import type { RootState } from "../Store";
import { getAvailableMenuParts } from "../App/access";
import { navigateWithPreloadedRoute, preloadRouteForPath } from "../App/routes";
import { preloadImage } from "../App/assetPreload";

interface HamburgerMenuProps {
  isMenuOpen: boolean;
  setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const HamburgerMenuDesktop: React.FC<HamburgerMenuProps> = ({
  isMenuOpen,
  setIsMenuOpen,
}) => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const navigate = useNavigate();
  const location = useLocation();
  const roles = useSelector((state: RootState) => state.userData.roles);
  const availableMenuParts = useMemo(() => getAvailableMenuParts(menuParts, roles), [roles]);

  useEffect(() => {
    const currentPart = availableMenuParts.findIndex((part) =>
      location.pathname.startsWith(part.path)
    );
    if (currentPart !== -1) setActiveIndex(currentPart);
  }, [availableMenuParts, location.pathname]);

  const activeHandler = (index: number, path: string) => {
    setActiveIndex(index);
    setIsMenuOpen(false);
    void navigateWithPreloadedRoute(navigate, path);
  };

  const menuClassName = useMemo(
    () =>
      `${isMenuOpen ? styles.expanded : styles.collapsed} ${styles.menuDesc}`,
    [isMenuOpen]
  );

  return (
    <ul className={menuClassName}>
      {availableMenuParts.map((elem, index) => {
        const Icon = elem.Icon;

        return (
          <li
            key={elem.path}
            className={index === activeIndex ? styles.active : ""}
            onMouseEnter={() => {
              void preloadRouteForPath(elem.path);
              void preloadImage(elem.img);
            }}
            title={!isMenuOpen ? elem.name : undefined}
          >
            <Link
              to={elem.path}
              className={styles.menuItemInner}
              onClick={(event) => {
                if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                activeHandler(index, elem.path);
              }}
            >
              <Icon className={styles.menuIcon} />
              <p className={styles.visible_text}>{elem.name}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};

export default HamburgerMenuDesktop;
