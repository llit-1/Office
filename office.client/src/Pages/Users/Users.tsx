import GenericTable from "../../Components/GenericTable/GenericTable";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import styles from "./Users.module.css";
import SearchIcon from "@mui/icons-material/Search";
import { useState, useMemo, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { OfficeUser, OfficeGroup, OfficeRole } from "../../Interfaces/Users";
import { get } from "../../Services/api";
import { callApi } from "../../Services/api";
import { RootState } from "../../Store";
import { activeIndexSet } from "../../Store/usersTabsSlice";

type Column<T> =
  | { label: string; key: keyof T }  // обычная колонка
  | { label: string; render: (row: T) => React.ReactNode; sortValue?: (row: T) => string | number };

const userColumns: Column<OfficeUser>[] = [
  { label: "Имя", render: (g) => `${g.surname} ${g.name}` , sortValue: (g) => `${g.surname} ${g.name}` },
  { label: "Должность", key: "position" },
];

const groupColumns: Column<OfficeGroup>[] = [
  { label: "Название", key: "name" },
  { label: "Кол-во ролей", render: (g) => g.officeRole?.length ?? 0, sortValue: (g) => g.officeRole?.length ?? 0 },
];

const roleColumns: Column<OfficeRole>[] = [
  { label: "Название", key: "name" },
  { label: "Описание", key: "description" },
  { label: "Код", key: "role" },
];


export default function Users() {
  const dispatch = useDispatch();
  const activeIndex = useSelector((s: RootState) => s.usersTabs.activeIndex);
  const setActiveIndexLocal = (index: number) => dispatch(activeIndexSet({ activeIndex: index }));
  const [searchText, setSearchText] = useState("");
  const [users, setUsers] = useState<OfficeUser[]>([]);
  const [groups, setGroups] = useState<OfficeGroup[]>([]);
  const [roles, setRoles] = useState<OfficeRole[]>([]);
  const [loading, setLoading] = useState(true);

  const getUsers = async (): Promise<OfficeUser[] | null> => {
    setLoading(true);
    const result = await callApi(get<OfficeUser[]>("/User/Users"));
    setLoading(false);
    if (result.ok) return result.data;
    return null;
  };

  const getGroups = async (): Promise<OfficeGroup[] | null> => {
    setLoading(true);
    const result = await callApi(get<OfficeGroup[]>("/User/Groups"));
    setLoading(false);
    if (result.ok) return result.data;
    return null;
  };

  const getRoles = async (): Promise<OfficeRole[] | null> => {
    setLoading(true);
    const result = await callApi(get<OfficeRole[]>("/User/Roles"));
    setLoading(false);
    if (result.ok) return result.data;
    return null;
  };

  const loadByIndex = async (index: number) => {
    if (index === 0) {
      dispatch(titleSet({ title: "Пользователи" }));
      const data = await getUsers();
      if (data) setUsers(data);
    } else if (index === 1) {
      dispatch(titleSet({ title: "Группы" }));
      const data = await getGroups();
      if (data) setGroups(data);
    } else if (index === 2) {
      dispatch(titleSet({ title: "Роли" }));
      const data = await getRoles();
      if (data) setRoles(data);
    }
  };

  useEffect(() => {
    dispatch(pathSet({ path: "/Main" }));
    dispatch(visibleSet({ visible: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    loadByIndex(activeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  const handleClick = (index: number) => setActiveIndexLocal(index);

  const filteredData = useMemo(() => {
  const lower = searchText.toLowerCase();

  if (activeIndex === 0) {
    return users.filter((u) =>
      `${u.surname ?? ""} ${u.name ?? ""}`.toLowerCase().includes(lower)
    );
  }

  if (activeIndex === 1) {
    return groups.filter((g) =>
      (g.name ?? "").toLowerCase().includes(lower)
    );
  }

  return roles.filter((r) =>
    (r.name ?? "").toLowerCase().includes(lower)
  );
}, [searchText, users, groups, roles, activeIndex]);


  return (
    <>
      <div className={styles.tt_wrapper}>
        <div className={styles.tabAndSearchWrapper}>
          <div className={styles.table_search}>
            <span>
              <SearchIcon />
            </span>
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

      {activeIndex === 0 && (
        <GenericTable<OfficeUser>
          data={filteredData as OfficeUser[]}
          columns={userColumns}
          routeTo="/Users/Edit"
          loading={loading}
          addOption={false}
        />
      )}

      {activeIndex === 1 && (
        <GenericTable<OfficeGroup>
          data={filteredData as OfficeGroup[]}
          columns={groupColumns}
          routeTo="/Groups/Edit"
          loading={loading}
          addOption={true}
        />
      )}

      {activeIndex === 2 && (
        <GenericTable<OfficeRole>
          data={filteredData as OfficeRole[]}
          columns={roleColumns}
          routeTo="/Roles/Edit"
          loading={loading}
          addOption={true}
        />
      )}
    </>
  );
}