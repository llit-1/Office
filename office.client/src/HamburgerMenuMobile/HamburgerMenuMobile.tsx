import React, { useEffect, useState } from "react";
import styles from "./HamburgerMenuMobile.module.css";
import { menuParts } from "../menuParts/menuParts";
import { useNavigate, useLocation } from "react-router-dom";
import { Drawer } from "@mui/material";

interface HamburgerMenuMobileProps {
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const iconSx = {
  width: 30,
  height: 30,
  fill: "#333333",
  marginLeft: "13px",
};

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
    navigate(path);
  };

  return (
    <Drawer
      anchor="left"
      open={isOpen}
      onClose={() => setIsOpen(false)}
      PaperProps={{
        sx: {
          width: "80%",
          maxWidth: 300,
          backgroundColor: "white",
          borderRight: "1px solid #E5E5E5",
        },
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
            >
              <div>
                <Icon sx={iconSx} />
                <p>{elem.name}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Drawer>
  );
};
