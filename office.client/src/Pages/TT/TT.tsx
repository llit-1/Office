import { useState, useEffect } from "react";
import BackArrow from "../../Components/BackArrow/BackArrow";
import styles from "./TT.module.css";
import SearchIcon from '@mui/icons-material/Search';
import { useDispatch } from "react-redux";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";

const TT = () => {
    const [activeIndex, setActiveIndex] = useState<number>(0);
    const [searchText, setSearchText] = useState<string>(""); // Состояние для поиска

    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(visibleSet({ visible: true }));
        dispatch(titleSet({ title: "Торговые точки" }));
    }, [dispatch]);

    const handleClick = (index: number) => {
        setActiveIndex(index);
    };

    const data = [
        {
            name: "00 Тестовая ТТ",
            organization: 'ООО "ЛюдиЛюбят"',
            codeTT: "0",
            codeOBD: "0",
            type: "Тестовая",
            users: "97",
            cash: "1",
            cameras: "0",
            yandexEda: "+",
            deliveryClub: "+",
            openDate: "04.03.2016",
            closeDate: "",
        },
        {
            name: "01 Другая ТТ",
            organization: 'ООО "ДругаяОрганизация"',
            codeTT: "1",
            codeOBD: "1",
            type: "Реальная",
            users: "50",
            cash: "2",
            cameras: "1",
            yandexEda: "-",
            deliveryClub: "+",
            openDate: "01.01.2020",
            closeDate: "",
        },
        {
            name: "02 Торговая точка 2",
            organization: 'ООО "Торговый дом"',
            codeTT: "2",
            codeOBD: "2",
            type: "Реальная",
            users: "30",
            cash: "3",
            cameras: "2",
            yandexEda: "+",
            deliveryClub: "-",
            openDate: "15.05.2019",
            closeDate: "",
        },
        {
            name: "03 Торговая точка 3",
            organization: 'ООО "Продукты и Ко"',
            codeTT: "3",
            codeOBD: "3",
            type: "Тестовая",
            users: "45",
            cash: "1",
            cameras: "0",
            yandexEda: "+",
            deliveryClub: "+",
            openDate: "10.10.2021",
            closeDate: "",
        },
        {
            name: "04 Торговая точка 4",
            organization: 'ООО "Свежие продукты"',
            codeTT: "4",
            codeOBD: "4",
            type: "Реальная",
            users: "60",
            cash: "2",
            cameras: "1",
            yandexEda: "-",
            deliveryClub: "+",
            openDate: "22.07.2018",
            closeDate: "",
        },
        {
            name: "05 Торговая точка 5",
            organization: 'ООО "Мир еды"',
            codeTT: "5",
            codeOBD: "5",
            type: "Тестовая",
            users: "25",
            cash: "1",
            cameras: "0",
            yandexEda: "+",
            deliveryClub: "-",
            openDate: "30.11.2022",
            closeDate: "",
        },
        {
            name: "06 Торговая точка 6",
            organization: 'ООО "Еда и напитки"',
            codeTT: "6",
            codeOBD: "6",
            type: "Реальная",
            users: "70",
            cash: "3",
            cameras: "2",
            yandexEda: "+",
            deliveryClub: "+",
            openDate: "12.09.2017",
            closeDate: "",
        },
        {
            name: "07 Торговая точка 7",
            organization: 'ООО "Продуктовый рай"',
            codeTT: "7",
            codeOBD: "7",
            type: "Тестовая",
            users: "40",
            cash: "1",
            cameras: "0",
            yandexEda: "-",
            deliveryClub: "+",
            openDate: "05.04.2020",
            closeDate: "",
        },
        {
            name: "08 Торговая точка 8",
            organization: 'ООО "Свежий выбор"',
            codeTT: "8",
            codeOBD: "8",
            type: "Реальная",
            users: "55",
            cash: "2",
            cameras: "1",
            yandexEda: "+",
            deliveryClub: "-",
            openDate: "18.12.2019",
            closeDate: "",
        },
        {
            name: "09 Торговая точка 9",
            organization: 'ООО "Вкусные продукты"',
            codeTT: "9",
            codeOBD: "9",
            type: "Тестовая",
            users: "35",
            cash: "1",
            cameras: "0",
            yandexEda: "+",
            deliveryClub: "+",
            openDate: "25.08.2021",
            closeDate: "",
        },
        {
            name: "10 Торговая точка 10",
            organization: 'ООО "Еда для всех"',
            codeTT: "10",
            codeOBD: "10",
            type: "Реальная",
            users: "65",
            cash: "3",
            cameras: "2",
            yandexEda: "-",
            deliveryClub: "+",
            openDate: "14.06.2018",
            closeDate: "",
        },
        {
            name: "11 Торговая точка 11",
            organization: 'ООО "Продуктовый мир"',
            codeTT: "11",
            codeOBD: "11",
            type: "Тестовая",
            users: "20",
            cash: "1",
            cameras: "0",
            yandexEda: "+",
            deliveryClub: "-",
            openDate: "03.03.2022",
            closeDate: "",
        },
        {
            name: "12 Торговая точка 12",
            organization: 'ООО "Свежий вкус"',
            codeTT: "12",
            codeOBD: "12",
            type: "Реальная",
            users: "75",
            cash: "2",
            cameras: "1",
            yandexEda: "+",
            deliveryClub: "+",
            openDate: "09.11.2017",
            closeDate: "",
        },
        {
            name: "13 Торговая точка 13",
            organization: 'ООО "Еда и радость"',
            codeTT: "13",
            codeOBD: "13",
            type: "Тестовая",
            users: "45",
            cash: "1",
            cameras: "0",
            yandexEda: "-",
            deliveryClub: "+",
            openDate: "27.07.2020",
            closeDate: "",
        },
        {
            name: "14 Торговая точка 14",
            organization: 'ООО "Продуктовый выбор"',
            codeTT: "14",
            codeOBD: "14",
            type: "Реальная",
            users: "50",
            cash: "2",
            cameras: "1",
            yandexEda: "+",
            deliveryClub: "-",
            openDate: "16.05.2019",
            closeDate: "",
        },
        {
            name: "15 Торговая точка 15",
            organization: 'ООО "Свежий мир"',
            codeTT: "15",
            codeOBD: "15",
            type: "Тестовая",
            users: "30",
            cash: "1",
            cameras: "0",
            yandexEda: "+",
            deliveryClub: "+",
            openDate: "22.09.2021",
            closeDate: "",
        },
        {
            name: "16 Торговая точка 16",
            organization: 'ООО "Еда и здоровье"',
            codeTT: "16",
            codeOBD: "16",
            type: "Реальная",
            users: "60",
            cash: "3",
            cameras: "2",
            yandexEda: "-",
            deliveryClub: "+",
            openDate: "11.12.2018",
            closeDate: "",
        },
        {
            name: "17 Торговая точка 17",
            organization: 'ООО "Продуктовый рай"',
            codeTT: "17",
            codeOBD: "17",
            type: "Тестовая",
            users: "25",
            cash: "1",
            cameras: "0",
            yandexEda: "+",
            deliveryClub: "-",
            openDate: "07.04.2022",
            closeDate: "",
        },
        {
            name: "18 Торговая точка 18",
            organization: 'ООО "Свежий выбор"',
            codeTT: "18",
            codeOBD: "18",
            type: "Реальная",
            users: "70",
            cash: "2",
            cameras: "1",
            yandexEda: "+",
            deliveryClub: "+",
            openDate: "19.10.2017",
            closeDate: "",
        },
        {
            name: "19 Торговая точка 19",
            organization: 'ООО "Еда для всех"',
            codeTT: "19",
            codeOBD: "19",
            type: "Тестовая",
            users: "40",
            cash: "1",
            cameras: "0",
            yandexEda: "-",
            deliveryClub: "+",
            openDate: "28.08.2020",
            closeDate: "",
        },
        {
            name: "20 Торговая точка 20",
            organization: 'ООО "Продуктовый мир"',
            codeTT: "20",
            codeOBD: "20",
            type: "Реальная",
            users: "55",
            cash: "2",
            cameras: "1",
            yandexEda: "+",
            deliveryClub: "-",
            openDate: "13.06.2019",
            closeDate: "",
        },
        {
            name: "21 Торговая точка 21",
            organization: 'ООО "Свежий вкус"',
            codeTT: "21",
            codeOBD: "21",
            type: "Тестовая",
            users: "35",
            cash: "1",
            cameras: "0",
            yandexEda: "+",
            deliveryClub: "+",
            openDate: "24.03.2021",
            closeDate: "",
        },
        {
            name: "22 Торговая точка 22",
            organization: 'ООО "Еда и радость"',
            codeTT: "22",
            codeOBD: "22",
            type: "Реальная",
            users: "65",
            cash: "3",
            cameras: "2",
            yandexEda: "-",
            deliveryClub: "+",
            openDate: "17.11.2018",
            closeDate: "",
        },
        {
            name: "23 Торговая точка 23",
            organization: 'ООО "Продуктовый выбор"',
            codeTT: "23",
            codeOBD: "23",
            type: "Тестовая",
            users: "20",
            cash: "1",
            cameras: "0",
            yandexEda: "+",
            deliveryClub: "-",
            openDate: "06.07.2022",
            closeDate: "",
        },
        {
            name: "24 Торговая точка 24",
            organization: 'ООО "Свежий мир"',
            codeTT: "24",
            codeOBD: "24",
            type: "Реальная",
            users: "75",
            cash: "2",
            cameras: "1",
            yandexEda: "+",
            deliveryClub: "+",
            openDate: "29.09.2017",
            closeDate: "",
        },
    ];

    // Фильтрация данных
    const filteredData = data.filter((item) => {
        return Object.values(item).some((value) =>
            value.toString().toLowerCase().includes(searchText.toLowerCase())
        );
    });

    return (
        <div className={styles.tt_wrapper}>

            {/*<BackArrow />*/}

            <div className={styles.tt_selectorTable}>
                {["Торговые точки", "Завод", "Офис", "Организации", "Должность", "Типы", "Кассовые клиенты"].map(
                    (text, index) => (
                        <div
                            key={index}
                            className={`${styles.selectorTable_text} ${activeIndex === index ? styles.selectorTable_text_active : ""
                                }`}
                            onClick={() => handleClick(index)}
                        >
                            {text}
                        </div>
                    )
                )}
            </div>


            {/* Поиск для таблицы */}
            <div className={styles.table_search}>
                <span><SearchIcon /></span>
                <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Поиск..."
                />
            </div>

            {/* Таблица "Торговые Точки" */}
            <div className={styles.table_wrapper}>
                <div className={styles.tableTT_header}>
                    <p style={{ width: "100%" }}>Торговая точка</p>
                    <p style={{ width: "100%" }}> Организация</p>
                    <p>Код ТТ</p>
                    <p>Код ОБД</p>
                    <p>Тип</p>
                    <p>Пользователи</p>
                    <p>Кассы</p>
                    <p>Камеры</p>
                    <p>Яндекс еда</p>
                    <p>Delivery Club</p>
                    <p>Дата открытия</p>
                    <p>Дата закрытия</p>
                </div>
                <div className={styles.tableTT_body}>
                    {filteredData.map((item, index) => (
                        <div className={styles.tableTT_body_item} key={index}>
                            <p style={{ width: "100%" }}>{item.name}</p>
                            <p style={{ width: "100%" }}>{item.organization}</p>
                            <p>{item.codeTT}</p>
                            <p>{item.codeOBD}</p>
                            <p>{item.type}</p>
                            <p>{item.users}</p>
                            <p>{item.cash}</p>
                            <p>{item.cameras}</p>
                            <p>{item.yandexEda}</p>
                            <p>{item.deliveryClub}</p>
                            <p>{item.openDate}</p>
                            <p>{item.closeDate}</p>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
};

export default TT;