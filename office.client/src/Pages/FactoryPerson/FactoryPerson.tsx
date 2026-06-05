import SearchIcon from "@mui/icons-material/Search";
import { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import GenericTable, { type Column } from "../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../Components/GenericTable/searchUtils";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import useDebouncedValue from "../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../Hooks/usePersistedSearchText";
import { FactoryPersonWithNav } from "../../Interfaces/Users";
import { callApi, get } from "../../Services/api";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import styles from "./FactoryPerson.module.css";

const personColumns: Column<FactoryPersonWithNav>[] = [
  { label: "Фамилия", key: "surname" },
  { label: "Имя", key: "name" },
  { label: "Отчество", key: "patronymic" },
  {
    label: "Дата рождения",
    render: (p) => (p.birthdate ? new Date(p.birthdate).toLocaleDateString("ru-RU") : ""),
    sortValue: (p) => p.birthdate ?? "",
  },
  { label: "Паспорт", key: "passport" },
  {
    label: "Отдел",
    render: (p) => p.factoryDepartmentName ?? "",
    sortValue: (p) => p.factoryDepartmentName ?? "",
  },
  {
    label: "Участок",
    render: (p) => p.factoryWorkshopName ?? "",
    sortValue: (p) => p.factoryWorkshopName ?? "",
  },
  {
    label: "Должность",
    render: (p) => p.factoryJobTitleName ?? "",
    sortValue: (p) => p.factoryJobTitleName ?? "",
  },
  {
    label: "Гражданство",
    render: (p) => p.citizenship?.name ?? "",
    sortValue: (p) => p.citizenship?.name ?? "",
    defaultVisible: false,
  },
  {
    label: "Юр. лицо",
    render: (p) => p.entity?.name ?? "",
    sortValue: (p) => p.entity?.name ?? "",
    defaultVisible: false,
  },
  {
    label: "Тип документа",
    render: (p) => p.documentType?.name ?? "",
    sortValue: (p) => p.documentType?.name ?? "",
    defaultVisible: false,
  },
  { label: "Номер телефона", key: "phone" },
  { label: "Номер банковской карты", key: "cardNumber", defaultVisible: false },
  {
    label: "Банк",
    render: (p) => p.bank?.name ?? "",
    sortValue: (p) => p.bank?.name ?? "",
    defaultVisible: false,
  },
  {
    label: "Дата въезда",
    render: (p) => (p.hostelChekin ? new Date(p.hostelChekin).toLocaleDateString("ru-RU") : ""),
    sortValue: (p) => p.hostelChekin ?? "",
    defaultVisible: false,
  },
  {
    label: "Дата выезда",
    render: (p) => (p.hostelCheckOut ? new Date(p.hostelCheckOut).toLocaleDateString("ru-RU") : ""),
    sortValue: (p) => p.hostelCheckOut ?? "",
    defaultVisible: false,
  },
  {
    label: "Дата приема на работу",
    render: (p) => (p.hiringDate ? new Date(p.hiringDate).toLocaleDateString("ru-RU") : ""),
    sortValue: (p) => p.hiringDate ?? "",
  },
  {
    label: "Дата увольнения",
    render: (p) => (p.dismissedDate ? new Date(p.dismissedDate).toLocaleDateString("ru-RU") : ""),
    sortValue: (p) => p.dismissedDate ?? "",
    defaultVisible: false,
  },
];

export default function FactoryPersonPage() {
  const tableStateKey = "factory-person-list";
  const dispatch = useDispatch();
  const [activeIndex, setActiveIndex] = useState(0);
  const [searchText, setSearchText] = usePersistedSearchText(tableStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);
  const [persons, setPersons] = useState<FactoryPersonWithNav[]>([]);
  const [loading, setLoading] = useState(true);

  const loadPersons = async () => {
    setLoading(true);
    const result = await callApi(get<FactoryPersonWithNav[]>("/PersonalityFactory/persons"));
    setLoading(false);
    if (result.ok) setPersons(result.data);
  };

  useEffect(() => {
    dispatch(pathSet({ path: "/Main" }));
    dispatch(visibleSet({ visible: true }));
  }, [dispatch]);

  useEffect(() => {
    dispatch(titleSet({ title: "Сотрудники завода" }));
    loadPersons();
  }, [dispatch]);

  const handleClick = (index: number) => setActiveIndex(index);

  const filteredData = useMemo(() => {
    return persons.filter((p) =>
      includesNormalized(`${p.surname ?? ""} ${p.name ?? ""}`, debouncedSearchText),
    );
  }, [debouncedSearchText, persons]);

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
        tableStateKey={tableStateKey}
        highlightQuery={debouncedSearchText}
      />
    </>
  );
}
