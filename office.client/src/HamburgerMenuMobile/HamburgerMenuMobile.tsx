import React, { useEffect, useMemo, useState } from "react";
import styles from "./HamburgerMenuMobile.module.css";
import { menuParts } from "../menuParts/menuParts";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Drawer } from "@mui/material";
import { navigateWithPreloadedRoute, preloadRouteForPath } from "../App/routes";
import { preloadImage } from "../App/assetPreload";
import { useSelector } from "react-redux";
import type { RootState } from "../Store";
import { getAvailableMenuParts } from "../App/access";

interface HamburgerMenuMobileProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export const HamburgerMenuMobile: React.FC<HamburgerMenuMobileProps> = ({
  isOpen,
  setIsOpen,
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
    setIsOpen(false);
    void navigateWithPreloadedRoute(navigate, path);
  };

  return (
    <Drawer
      anchor="left"
      open={isOpen}
      onClose={() => setIsOpen(false)}
      PaperProps={{
        className: styles.drawerPaper,
      }}
    >
      <ul className={styles.menu}>
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
            >
              <Link
                to={elem.path}
                onClick={(event) => {
                  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  activeHandler(index, elem.path);
                }}
              >
                <Icon className={styles.menuIcon} />
                <p>{elem.name}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
};
