import { useMemo, useState } from "react";
import styles from "./MultiplySelect.module.css";

export const MultiplySelect = () => {
  const [searchText, setSearchText] = useState("");
  const [options, setOptions] = useState<Option[]>(initialData.sort((a, b) => {
        // Сначала выбранные
        if (a.selected && !b.selected) return -1;
        if (!a.selected && b.selected) return 1;
        return 0;
    }));

  const filteredData = useMemo(() => {
    const lower = searchText.toLowerCase();
    return options.filter((item) =>
      item.name.toLowerCase().includes(lower)
    )
  }, [options, searchText]);

  const toggleSelect = (name: string) => {
    setOptions((prev) =>
      prev.map((item) =>
        item.name === name
          ? { ...item, selected: !item.selected }
          : item
      )
    );
  };

  return (
    <div className={styles.multiplySelectWrapper}>
      <input
        className={styles.search}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Поиск..."
      />

      <div className={styles.optionsWrapper}>
        {filteredData.map((item, index) => (
          <div
            key={index}
            className={`${styles.optionItem} ${
              item.selected ? styles.selected : ""
            }`}
            onClick={() => toggleSelect(item.name)}
          >
            {item.name}
          </div>
        ))}
      </div>
    </div>
  );
};

type Option = {
  name: string;
  selected: boolean;
};

const initialData: Option[] = [
  { name: "Группа 17", selected: true },
  { name: "ТМ 42", selected: false },
  { name: "Розница Доставка 7", selected: true },
  { name: "Партнерское управление 9", selected: false },
  { name: "Группа 23", selected: true },
  { name: "ТМ 14", selected: true },
  { name: "Розница Франшиза 31", selected: false },
  { name: "Доставка 56", selected: true },
  { name: "Группа 48", selected: false },
  { name: "ТМ 3", selected: true },
  { name: "Розница Франшиза 11", selected: false },
  { name: "Партнерское управление 27", selected: true },
  { name: "Группа 36", selected: true },
  { name: "ТМ 91", selected: false },
  { name: "Розница Доставка 62", selected: true },
  { name: "Группа 5", selected: false },
  { name: "Доставка 44", selected: true },
  { name: "ТМ 78", selected: false },
  { name: "Партнерское управление 19", selected: true },
  { name: "Группа 8", selected: true },
  { name: "Розница Франшиза 52", selected: false },
  { name: "ТМ 67", selected: false },
  { name: "Группа 29", selected: true },
  { name: "Розница Доставка 15", selected: false },
  { name: "Партнерское управление 33", selected: true },
  { name: "Группа 41", selected: false },
  { name: "ТМ 85", selected: true },
  { name: "Розница Франшиза 6", selected: true },
  { name: "Партнерское управление 48", selected: false },
  { name: "Группа 57", selected: true },
  { name: "Доставка 11", selected: false },
  { name: "ТМ 39", selected: true },
  { name: "Группа 72", selected: false },
  { name: "Розница Франшиза 98", selected: true },
  { name: "Партнерское управление 60", selected: false },
  { name: "Группа 91", selected: true },
  { name: "ТМ 25", selected: false },
  { name: "Розница Доставка 74", selected: true },
  { name: "Группа 4", selected: false },
  { name: "Доставка 89", selected: true },
  { name: "Партнерское управление 43", selected: false },
  { name: "Группа 66", selected: true },
  { name: "Розница Франшиза 37", selected: true },
  { name: "ТМ 52", selected: false },
  { name: "Партнерское управление 71", selected: true },
  { name: "Группа 12", selected: false },
  { name: "Розница Доставка 28", selected: true },
  { name: "ТМ 94", selected: true },
  { name: "Группа 33", selected: false },
  { name: "Доставка 21", selected: true },
  { name: "Розница Франшиза 63", selected: false },
  { name: "Партнерское управление 54", selected: true },
  { name: "Группа 20", selected: false },
  { name: "ТМ 47", selected: true },
  { name: "Розница Доставка 82", selected: false },
  { name: "Группа 73", selected: true },
  { name: "ТМ 58", selected: false },
  { name: "Партнерское управление 13", selected: true },
  { name: "Группа 26", selected: false },
];
