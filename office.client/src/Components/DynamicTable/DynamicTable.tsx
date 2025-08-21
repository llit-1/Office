import React, { useState, useEffect } from "react";
import styles from "./DynamicTable.module.css"; // Используем ваши стили

// Тип для данных таблицы
type TableData = {
    [key: string]: string | number; // Данные могут быть строкой или числом
};

// Тип для колонок таблицы
type ColumnConfig = {
    key: string; // Ключ данных
    title: string; // Заголовок столбца
    minWidth: number; // Минимальная ширина экрана для отображения столбца
    width?: string; // Ширина столбца (опционально)
};

// Пропсы для компонента DynamicTable
type DynamicTableProps = {
    data: TableData[]; // Данные таблицы
    columns: ColumnConfig[]; // Конфигурация столбцов
    searchText: string; // Текст для поиска
    onSearchChange: (value: string) => void; // Обработчик изменения текста поиска
};

const DynamicTable: React.FC<DynamicTableProps> = ({ data, columns, searchText, onSearchChange }) => {
    const [visibleColumns, setVisibleColumns] = useState<ColumnConfig[]>(columns);

    // Фильтрация данных
    const filteredData = data.filter((item) => {
        return columns.some((column) =>
            item[column.key].toString().toLowerCase().includes(searchText.toLowerCase())
        );
    });

    // Логика для скрытия/отображения столбцов в зависимости от ширины экрана
    useEffect(() => {
        const handleResize = () => {
            const screenWidth = window.innerWidth;
            const updatedColumns = columns.map((column) => ({
                ...column,
                isVisible: screenWidth >= column.minWidth,
            }));
            setVisibleColumns(updatedColumns);
        };

        handleResize(); // Вызов при первоначальной загрузке
        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, [columns]);

    return (
        <div className={styles.tt_wrapper}>
            {/* Поиск */}
            <div className={styles.table_search}>
                <input
                    type="text"
                    value={searchText}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Поиск..."
                />
            </div>

            {/* Таблица */}
            <div className={styles.table_wrapper}>
                {/* Заголовок таблицы */}
                <div className={styles.tableTT_header}>
                    {visibleColumns.map(
                        (column, index) =>
                            column.isVisible && (
                                <p key={index} style={{ width: column.width || "100%" }}>
                                    {column.title}
                                </p>
                            )
                    )}
                </div>

                {/* Тело таблицы */}
                <div className={styles.tableTT_body}>
                    {filteredData.map((item, rowIndex) => (
                        <div key={rowIndex} className={styles.tableTT_body_item}>
                            {visibleColumns.map(
                                (column, colIndex) =>
                                    column.isVisible && (
                                        <p key={colIndex} style={{ width: column.width || "100%" }}>
                                            {item[column.key]}
                                        </p>
                                    )
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default DynamicTable;