import GenericTable from "../../Components/GenericTable/GenericTable";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import styles from "./FactoryPerson.module.css";
import SearchIcon from "@mui/icons-material/Search";
import { useState, useMemo, useEffect } from "react";
import { useDispatch } from "react-redux";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { FactoryPersonWithNav } from "../../Interfaces/Users";
import { get, callApi } from "../../Services/api";

type Column<T> =
  | { label: string; key: keyof T }
  | { label: string; render: (row: T) => React.ReactNode; sortValue?: (row: T) => string | number };

const personColumns: Column<FactoryPersonWithNav>[] = [
  { label: "Фамилия", key: "surname" },
  { label: "Имя", key: "name" },
  { label: "Отчество", key: "patronymic" },
  { label: "Дата рождения", render: (p) => p.birthdate ? new Date(p.birthdate).toLocaleDateString('ru-RU') : "", sortValue: (p) => p.birthdate ?? "" },
  { label: "Паспорт", key: "passport" },
  { label: "Отдел", render: (p) => p.factoryDepartmentName ?? "" },
  { label: "Участок", render: (p) => p.factoryWorkshopName ?? "" },
  { label: "Должность", render: (p) => p.factoryJobTitleName ?? "" },
  { label: "Гражданство", render: (p) => p.citizenship?.name ?? "" },
  { label: "Юр. лицо", render: (p) => p.entity?.name ?? "" },
  { label: "Тип документа", render: (p) => p.documentType?.name ?? "" },
  { label: "Номер телефона", key: "phone" },
  { label: "Номер банковской карты", key: "cardNumber" },
  { label: "Банк", render: (p) => p.bank?.name ?? "" },
  { label: "Дата въезда", render: (p) => p.hostelChekin ? new Date(p.hostelChekin).toLocaleDateString('ru-RU') : "" },
  { label: "Дата выезда", render: (p) => p.hostelCheckOut ? new Date(p.hostelCheckOut).toLocaleDateString('ru-RU') : "" },
  { label: "Дата приема на работу", render: (p) => p.hiringDate ? new Date(p.hiringDate).toLocaleDateString('ru-RU') : "" },
  { label: "Дата увольнения", render: (p) => p.dismissedDate ? new Date(p.dismissedDate).toLocaleDateString('ru-RU') : "" },
];

export default function FactoryPersonPage() {
  const dispatch = useDispatch();
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchText, setSearchText] = useState("");
  const [persons, setPersons] = useState<FactoryPersonWithNav[]>([]);
  const [loading, setLoading] = useState(true);
  // navigate not required here

  const loadPersons = async () => {
    setLoading(true);
    const result = await callApi(get<FactoryPersonWithNav[]>("/PersonalityFactory/persons"));
    setLoading(false);
    if (result.ok) setPersons(result.data);
  };

  useEffect(() => {
    dispatch(pathSet({ path: "/Main" }));
    dispatch(visibleSet({ visible: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatch]);

  useEffect(() => {
    dispatch(titleSet({ title: "Cотрудники завод" }));
    loadPersons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClick = (index: number) => setActiveIndex(index);

  const filteredData = useMemo(() => {
    const lower = searchText.toLowerCase();
    return persons.filter((p) => `${p.surname ?? ""} ${p.name ?? ""}`.toLowerCase().includes(lower));
  }, [searchText, persons]);

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
            items={["Сотрудники"]}
            activeIndex={activeIndex}
            onChange={handleClick}
          />
        </div>
      </div>

      <GenericTable<FactoryPersonWithNav>
        data={filteredData}
        columns={personColumns}
        routeTo="/FactoryPerson/Edit"
        loading={loading}
        addOption={true}
      />
    </>
  );
}
// file intentionally ends after default export above