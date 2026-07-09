import React, { useEffect, useState } from "react";
import styles from "./HamburgerMenuMobile.module.css";
import { menuParts } from "../menuParts/menuParts";
import { useNavigate, useLocation } from "react-router-dom";
import { Drawer } from "@mui/material";
import { navigateWithPreloadedRoute, preloadRouteForPath } from "../App/routes";
import { preloadImage } from "../App/assetPreload";

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

  useEffect(() => {
    const currentPart = menuParts.findIndex((part) =>
      location.pathname.startsWith(part.path)
    );
    if (currentPart !== -1) setActiveIndex(currentPart);
  }, [location.pathname]);

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
        {menuParts.map((elem, index) => {
          const Icon = elem.Icon;

          return (
            <li
              key={elem.path}
              className={index === activeIndex ? styles.active : ""}
              onClick={() => activeHandler(index, elem.path)}
              onMouseEnter={() => {
                void preloadRouteForPath(elem.path);
                void preloadImage(elem.img);
              }}
            >
              <div>
                <Icon className={styles.menuIcon} />
                <p>{elem.name}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
};
