import styles from './HamburgerMenuDesktop.module.css';
import { useState, useEffect } from 'react';
import Hamburger from 'hamburger-react';
import { menuParts } from "../menuParts/menuParts";
import { useNavigate, useLocation } from "react-router-dom";
import { Tooltip, tooltipClasses } from "@mui/material";

const HamburgerMenu = () => {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const navigate = useNavigate();
  const location = useLocation();

  // Синхронизация активного раздела с текущим маршрутом
  useEffect(() => {
    const currentPart = menuParts.findIndex(part => part.path === location.pathname);
    if (currentPart !== -1) {
      setActiveIndex(currentPart);
    }
  }, [location.pathname]);

  const toggleMenu = () => {
    setIsCollapsed(!isCollapsed);
  };

  const activeHandler = (index: number, path: string) => {
    setActiveIndex(index);
    setIsCollapsed(true);
    navigate(path);
  };

  return (
    <ul className={isCollapsed ? styles.collapsed : styles.expanded}>
      <li>
        {isCollapsed ? <div className={styles.hamburger_logo_hidden_text}></div> : <div className={styles.hamburger_logo}></div>}
        <div className={styles.hamburger}>
          <Hamburger toggled={!isCollapsed} toggle={toggleMenu} size={20} color="white" />
        </div>
      </li>
      {menuParts.map((elem, index) => (
        <li 
          key={index}
          className={index === activeIndex ? styles.active : ''} 
          onClick={() => activeHandler(index, elem.path)}
        >
          {/* Tooltip будет активен только в свернутом состоянии */}
          {isCollapsed ? (
            <Tooltip 
              enterDelay={500}
              leaveDelay={200}
              title={elem.name}
              slotProps={{
                [`&.${tooltipClasses.popper}[data-popper-placement*="right"] .${tooltipClasses.tooltip}`]:
                {
                  marginLeft: '10px',
                },
              }} 
              placement="right">
              <div>
                {elem.component}
              </div>
            </Tooltip>
          ) : (
            <div>
              {elem.component}
              <p className={isCollapsed ? styles.hidden_text : styles.visible_text}>{elem.name}</p>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
};

export default HamburgerMenu;
