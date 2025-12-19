import styles from "./HamburgerMenuDesktop.module.css";
import React, { useEffect, useMemo, useState } from "react";
import { menuParts } from "../menuParts/menuParts";
import { useNavigate, useLocation } from "react-router-dom";
import { Tooltip, tooltipClasses } from "@mui/material";

interface HamburgerMenuProps {
  isMenuOpen: boolean;
  setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const iconSx = {
  width: 30,
  height: 30,
  fill: "#333333",
  marginLeft: "13px",
};

const HamburgerMenuDesktop: React.FC<HamburgerMenuProps> = ({
  isMenuOpen,
  setIsMenuOpen,
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
    setIsMenuOpen(false);
    navigate(path);
  };

  const menuClassName = useMemo(
    () =>
      `${isMenuOpen ? styles.expanded : styles.collapsed} ${styles.menuDesc}`,
    [isMenuOpen]
  );

  return (
    <ul className={menuClassName}>
      {menuParts.map((elem, index) => {
        const Icon = elem.Icon;

        return (
          <li
            key={elem.path}
            className={index === activeIndex ? styles.active : ""}
            onClick={() => activeHandler(index, elem.path)}
          >
            {isMenuOpen ? (
              <div>
                <Icon sx={iconSx} />
                <p className={styles.visible_text}>{elem.name}</p>
              </div>
            ) : (
              <Tooltip
                enterDelay={500}
                leaveDelay={200}
                title={elem.name}
                placement="right"
                slotProps={{
                  popper: {
                    sx: {
                      [`&.${tooltipClasses.popper}[data-popper-placement*="right"] .${tooltipClasses.tooltip}`]:
                        {
                          marginLeft: "10px",
                        },
                    },
                  },
                }}
              >
                <div>
                  <Icon sx={iconSx} />
                </div>
              </Tooltip>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default HamburgerMenuDesktop;
