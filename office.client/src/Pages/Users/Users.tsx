import GenericTable from "../../Components/GenericTable/GenericTable";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import styles from "./Users.module.css";
import SearchIcon from "@mui/icons-material/Search";
import { useState, useMemo, useEffect } from "react";
import { useDispatch } from "react-redux";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";

export interface User {
  name: string;
  role: string;
  tt: string;
  userType: string;
  status: string;
}

const testData: User[] = [
  { name: "Иван Иванов", role: "Менеджер", tt: "TT001", userType: "Pro", status: "Активен" },
  { name: "Мария Петрова", role: "Аналитик", tt: "TT002", userType: "Free", status: "Неактивен" },
  { name: "Иван Иванов", role: "Менеджер", tt: "TT001", userType: "Pro", status: "Активен" },
  { name: "Мария Петрова", role: "Аналитик", tt: "TT002", userType: "Free", status: "Неактивен" },
  { name: "Иван Иванов", role: "Менеджер", tt: "TT001", userType: "Pro", status: "Активен" },
  { name: "Мария Петрова", role: "Аналитик", tt: "TT002", userType: "Free", status: "Неактивен" },
  { name: "Иван Иванов", role: "Менеджер", tt: "TT001", userType: "Pro", status: "Активен" },
  { name: "Мария Петрова", role: "Аналитик", tt: "TT002", userType: "Free", status: "Неактивен" },
  { name: "Иван Иванов", role: "Менеджер", tt: "TT001", userType: "Pro", status: "Активен" },
  { name: "Мария Петрова", role: "Аналитик", tt: "TT002", userType: "Free", status: "Неактивен" },
  { name: "Иван Иванов", role: "Менеджер", tt: "TT001", userType: "Pro", status: "Активен" },
  { name: "Мария Петрова", role: "Аналитик", tt: "TT002", userType: "Free", status: "Неактивен" },
  { name: "Иван Иванов", role: "Менеджер", tt: "TT001", userType: "Pro", status: "Активен" },
  { name: "Мария Петрова", role: "Аналитик", tt: "TT002", userType: "Free", status: "Неактивен" },
];

const columns: { key: keyof User; label: string }[] = [
  { key: "name", label: "Имя" },
  { key: "role", label: "Должность" },
  { key: "tt", label: "ТТ" },
];

export default function Users() {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [searchText, setSearchText] = useState("");
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(pathSet({ path: "/Main" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Пользователи" }));
  }, [dispatch]);

  const handleClick = (index: number) => setActiveIndex(index);

  const filteredData = useMemo(() => {
    const lower = searchText.toLowerCase();
    return testData.filter((item) =>
      item.name.toLowerCase().includes(lower)
    );
  }, [searchText]);

  return (
    <>
      <div className={styles.tt_wrapper}>
        <div className={styles.tabAndSearchWrapper}>
          <div className={styles.table_search}>
            <span><SearchIcon /></span>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Поиск..."
            />
          </div>

          <TabNavigation
            items={["Пользователи", "Группы", "Роли"]}
            activeIndex={activeIndex}
            onChange={handleClick}
          />
        </div>
      </div>

      <GenericTable<User>
        data={filteredData}
        columns={columns}
        routeTo="/Users/Edit"
      />
    </>
  );
}
