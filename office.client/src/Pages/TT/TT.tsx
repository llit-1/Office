import { useState, useEffect, useMemo } from "react";
import styles from "./TT.module.css";
import SearchIcon from '@mui/icons-material/Search';
import { useDispatch } from "react-redux";
import { visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import { pathSet } from "../../Store/stateForBackButtonSlice";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import GenericTable from "../../Components/GenericTable/GenericTable";

interface TTs {
    name: string;
    entity: string;
    codeTT: number;
    codeObd: number;
    type: string;
    usersCount: number;
    cashCount: number;
    camsCount: number;
    yandex: string;
    delivery: string;
    dateOpen: string;
}

const TT = () => {
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [searchText, setSearchText] = useState<string>(""); // Состояние для поиска

    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(visibleSet({ visible: true }));
        dispatch(titleSet({ title: "Торговые точки" }));
        dispatch(pathSet({ path: "/" }));
    }, [dispatch]);

    const handleClick = (index: number) => {
        setActiveIndex(index);
    };

    const testData: TTs[] = [
        { name: "00 Тестовая ТТ", entity: "ООО ЛюдиЛюбят", codeTT: 88, codeObd: 994431, type: "Спальник", usersCount: 126, cashCount: 2, camsCount: 4, yandex: "+", delivery: "-", dateOpen: "04.09.2025" },
        { name: "01 Центральный", entity: "ИП Петров", codeTT: 15, codeObd: 112233, type: "Магазин", usersCount: 89, cashCount: 3, camsCount: 6, yandex: "+", delivery: "+", dateOpen: "12.01.2023" },
        { name: "02 Восточный", entity: "ООО ТоргСервис", codeTT: 42, codeObd: 445566, type: "ТЦ", usersCount: 215, cashCount: 5, camsCount: 8, yandex: "-", delivery: "+", dateOpen: "03.08.2024" },
        { name: "03 Северный Парк", entity: "ЗАО СеверСтайл", codeTT: 77, codeObd: 778899, type: "Бутик", usersCount: 54, cashCount: 1, camsCount: 2, yandex: "+", delivery: "-", dateOpen: "22.11.2022" },
        { name: "04 Южные Ворота", entity: "ООО ЮгТрейд", codeTT: 33, codeObd: 334455, type: "Гипермаркет", usersCount: 342, cashCount: 8, camsCount: 12, yandex: "+", delivery: "+", dateOpen: "15.06.2023" },
        { name: "05 Западный Холл", entity: "ИП Сидорова", codeTT: 96, codeObd: 667788, type: "ТРЦ", usersCount: 178, cashCount: 4, camsCount: 7, yandex: "-", delivery: "-", dateOpen: "30.03.2024" },
        { name: "06 Центр Моды", entity: "ООО ФэшнГрупп", codeTT: 51, codeObd: 990011, type: "Бутик", usersCount: 67, cashCount: 2, camsCount: 3, yandex: "+", delivery: "-", dateOpen: "08.12.2022" },
        { name: "07 МегаМолл", entity: "ЗАО МегаСтрой", codeTT: 24, codeObd: 223344, type: "ТЦ", usersCount: 431, cashCount: 10, camsCount: 15, yandex: "+", delivery: "+", dateOpen: "19.05.2023" },
        { name: "08 Городской", entity: "ИП Козлов", codeTT: 69, codeObd: 556677, type: "Магазин", usersCount: 92, cashCount: 2, camsCount: 4, yandex: "-", delivery: "-", dateOpen: "11.09.2024" },
        { name: "09 Премиум Зона", entity: "ООО ЛюксГрупп", codeTT: 83, codeObd: 881122, type: "Бутик", usersCount: 38, cashCount: 1, camsCount: 2, yandex: "+", delivery: "-", dateOpen: "27.02.2025" },
        { name: "10 Семейный", entity: "ИП Николаев", codeTT: 47, codeObd: 334477, type: "Супермаркет", usersCount: 156, cashCount: 3, camsCount: 5, yandex: "+", delivery: "+", dateOpen: "14.07.2023" },
        { name: "11 Деловой Центр", entity: "ООО БизнесТрейд", codeTT: 72, codeObd: 998800, type: "ТЦ", usersCount: 198, cashCount: 4, camsCount: 6, yandex: "-", delivery: "-", dateOpen: "05.10.2024" },
        { name: "12 Теплый Дом", entity: "ИП Васнецова", codeTT: 39, codeObd: 443322, type: "Магазин", usersCount: 73, cashCount: 2, camsCount: 3, yandex: "+", delivery: "-", dateOpen: "20.01.2023" },
        { name: "13 Студенческий", entity: "ООО ЮнитГрупп", codeTT: 55, codeObd: 665544, type: "ТЦ", usersCount: 267, cashCount: 6, camsCount: 9, yandex: "+", delivery: "+", dateOpen: "09.04.2024" },
        { name: "14 Спортивный Мир", entity: "ЗАО СпортТрейд", codeTT: 18, codeObd: 112255, type: "Спортмагазин", usersCount: 114, cashCount: 3, camsCount: 4, yandex: "-", delivery: "-", dateOpen: "25.08.2023" }
    ]

    const filteredData = useMemo(() => {
        const lower = searchText.toLowerCase();
        return testData.filter((item) =>
            item.name.toLowerCase().includes(lower)
        );
    }, [searchText]);

    const columns: { key: keyof TTs; label: string }[] = [
        { key: "name", label: "Торговая точка" },
        { key: "entity", label: "Организация" },
        { key: "codeTT", label: "Код ТТ" },
        { key: "codeObd", label: "Код ОБД" },
        { key: "type", label: "Тип" },
        { key: "usersCount", label: "Пользователи" },
        { key: "cashCount", label: "Кассы" },
        { key: "camsCount", label: "Камеры" },
        { key: "yandex", label: "Яндекс Еда" },
        { key: "delivery", label: "Delivery Club" },
        { key: "dateOpen", label: "Дата открытия" },
    ];

    

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
                        items={["Торговые точки", "Завод", "Офис", "Организации", "Должность", "Типы", "Кассовые клиенты"]}
                        activeIndex={activeIndex}
                        onChange={handleClick}
                    />
                </div>
            </div>

            <GenericTable<TTs>
                data={filteredData}
                columns={columns}
            />
        </>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export default TT;