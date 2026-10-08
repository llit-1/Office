import React, { useEffect, useRef } from "react";
import styles from "./Tabnavigation.module.css"

interface TabNavigationProps {
  items: string[];
  activeIndex: number;
  onChange: (index: number) => void;
}

const TabNavigation: React.FC<TabNavigationProps> = ({ items, activeIndex, onChange }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // на узком экране вкладки прокручиваются вбок: активную показываем, не трогая вертикальную прокрутку
  useEffect(() => {
    const container = containerRef.current;
    const active = container?.children[activeIndex] as HTMLElement | undefined;
    if (!container || !active || container.scrollWidth <= container.clientWidth) return;
    const offset = active.getBoundingClientRect().left - container.getBoundingClientRect().left + container.scrollLeft;
    const left = offset - (container.clientWidth - active.offsetWidth) / 2;
    container.scrollTo({ left: Math.max(0, left), behavior: "auto" });
  }, [activeIndex, items.length]);

  return (
    <div className={styles.selectorTable} ref={containerRef}>
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
