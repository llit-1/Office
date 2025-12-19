import React from "react";
import styles from "./Tabnavigation.module.css"

interface TabNavigationProps {
  items: string[];
  activeIndex: number;
  onChange: (index: number) => void;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ items, activeIndex, onChange }) => {
  return (
    <div className={styles.selectorTable}>
      {items.map((text, index) => (
        <div
          key={index}
          className={`${styles.selectorTable_text} ${
            activeIndex === index ? styles.selectorTable_text_active : ""
          }`}
          onClick={() => onChange(index)}
        >
          {text}
        </div>
      ))}
    </div>
  );
};

export default TabNavigation;
