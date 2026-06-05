import SearchIcon from "@mui/icons-material/Search";
import { useEffect, useMemo, useState } from "react";
import { useDispatch } from "react-redux";
import GenericTable from "../../Components/GenericTable/GenericTable";
import { includesNormalized } from "../../Components/GenericTable/searchUtils";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import useDebouncedValue from "../../Hooks/useDebouncedValue";
import usePersistedSearchText from "../../Hooks/usePersistedSearchText";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import styles from "./TT.module.css";

interface TTs {
  id: number;
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

const tableStateKey = "tt-list";

const TT = () => {
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [searchText, setSearchText] = usePersistedSearchText(tableStateKey);
  const debouncedSearchText = useDebouncedValue(searchText);

  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "РўРѕСЂРіРѕРІС‹Рµ С‚РѕС‡РєРё" }));
    dispatch(pathSet({ path: "/" }));
  }, [dispatch]);

  const handleClick = (index: number) => {
    setActiveIndex(index);
  };

  const testData: TTs[] = [
    { id: 0, name: "00 РўРµСЃС‚РѕРІР°СЏ РўРў", entity: "РћРћРћ Р›СЋРґРёР›СЋР±СЏС‚", codeTT: 88, codeObd: 994431, type: "РЎРїР°Р»СЊРЅРёРє", usersCount: 126, cashCount: 2, camsCount: 4, yandex: "+", delivery: "-", dateOpen: "04.09.2025" },
    { id: 1, name: "01 Р¦РµРЅС‚СЂР°Р»СЊРЅС‹Р№", entity: "РРџ РџРµС‚СЂРѕРІ", codeTT: 15, codeObd: 112233, type: "РњР°РіР°Р·РёРЅ", usersCount: 89, cashCount: 3, camsCount: 6, yandex: "+", delivery: "+", dateOpen: "12.01.2023" },
    { id: 2, name: "02 Р’РѕСЃС‚РѕС‡РЅС‹Р№", entity: "РћРћРћ РўРѕСЂРіРЎРµСЂРІРёСЃ", codeTT: 42, codeObd: 445566, type: "РўР¦", usersCount: 215, cashCount: 5, camsCount: 8, yandex: "-", delivery: "+", dateOpen: "03.08.2024" },
    { id: 3, name: "03 РЎРµРІРµСЂРЅС‹Р№ РџР°СЂРє", entity: "Р—РђРћ РЎРµРІРµСЂРЎС‚Р°Р№Р»", codeTT: 77, codeObd: 778899, type: "Р‘СѓС‚РёРє", usersCount: 54, cashCount: 1, camsCount: 2, yandex: "+", delivery: "-", dateOpen: "22.11.2022" },
    { id: 4, name: "04 Р®Р¶РЅС‹Рµ Р’РѕСЂРѕС‚Р°", entity: "РћРћРћ Р®РіРўСЂРµР№Рґ", codeTT: 33, codeObd: 334455, type: "Р“РёРїРµСЂРјР°СЂРєРµС‚", usersCount: 342, cashCount: 8, camsCount: 12, yandex: "+", delivery: "+", dateOpen: "15.06.2023" },
    { id: 5, name: "05 Р—Р°РїР°РґРЅС‹Р№ РҐРѕР»Р»", entity: "РРџ РЎРёРґРѕСЂРѕРІР°", codeTT: 96, codeObd: 667788, type: "РўР Р¦", usersCount: 178, cashCount: 4, camsCount: 7, yandex: "-", delivery: "-", dateOpen: "30.03.2024" },
    { id: 6, name: "06 Р¦РµРЅС‚СЂ РњРѕРґС‹", entity: "РћРћРћ Р¤СЌС€РЅР“СЂСѓРїРї", codeTT: 51, codeObd: 990011, type: "Р‘СѓС‚РёРє", usersCount: 67, cashCount: 2, camsCount: 3, yandex: "+", delivery: "-", dateOpen: "08.12.2022" },
    { id: 7, name: "07 РњРµРіР°РњРѕР»Р»", entity: "Р—РђРћ РњРµРіР°РЎС‚СЂРѕР№", codeTT: 24, codeObd: 223344, type: "РўР¦", usersCount: 431, cashCount: 10, camsCount: 15, yandex: "+", delivery: "+", dateOpen: "19.05.2023" },
    { id: 8, name: "08 Р“РѕСЂРѕРґСЃРєРѕР№", entity: "РРџ РљРѕР·Р»РѕРІ", codeTT: 69, codeObd: 556677, type: "РњР°РіР°Р·РёРЅ", usersCount: 92, cashCount: 2, camsCount: 4, yandex: "-", delivery: "-", dateOpen: "11.09.2024" },
    { id: 9, name: "09 РџСЂРµРјРёСѓРј Р—РѕРЅР°", entity: "РћРћРћ Р›СЋРєСЃР“СЂСѓРїРї", codeTT: 83, codeObd: 881122, type: "Р‘СѓС‚РёРє", usersCount: 38, cashCount: 1, camsCount: 2, yandex: "+", delivery: "-", dateOpen: "27.02.2025" },
    { id: 10, name: "10 РЎРµРјРµР№РЅС‹Р№", entity: "РРџ РќРёРєРѕР»Р°РµРІ", codeTT: 47, codeObd: 334477, type: "РЎСѓРїРµСЂРјР°СЂРєРµС‚", usersCount: 156, cashCount: 3, camsCount: 5, yandex: "+", delivery: "+", dateOpen: "14.07.2023" },
    { id: 11, name: "11 Р”РµР»РѕРІРѕР№ Р¦РµРЅС‚СЂ", entity: "РћРћРћ Р‘РёР·РЅРµСЃРўСЂРµР№Рґ", codeTT: 72, codeObd: 998800, type: "РўР¦", usersCount: 198, cashCount: 4, camsCount: 6, yandex: "-", delivery: "-", dateOpen: "05.10.2024" },
    { id: 12, name: "12 РўРµРїР»С‹Р№ Р”РѕРј", entity: "РРџ Р’Р°СЃРЅРµС†РѕРІР°", codeTT: 39, codeObd: 443322, type: "РњР°РіР°Р·РёРЅ", usersCount: 73, cashCount: 2, camsCount: 3, yandex: "+", delivery: "-", dateOpen: "20.01.2023" },
    { id: 13, name: "13 РЎС‚СѓРґРµРЅС‡РµСЃРєРёР№", entity: "РћРћРћ Р®РЅРёС‚Р“СЂСѓРїРї", codeTT: 55, codeObd: 665544, type: "РўР¦", usersCount: 267, cashCount: 6, camsCount: 9, yandex: "+", delivery: "+", dateOpen: "09.04.2024" },
    { id: 14, name: "14 РЎРїРѕСЂС‚РёРІРЅС‹Р№ РњРёСЂ", entity: "Р—РђРћ РЎРїРѕСЂС‚РўСЂРµР№Рґ", codeTT: 18, codeObd: 112255, type: "РЎРїРѕСЂС‚РјР°РіР°Р·РёРЅ", usersCount: 114, cashCount: 3, camsCount: 4, yandex: "-", delivery: "-", dateOpen: "25.08.2023" },
  ];

  const filteredData = useMemo(
    () => testData.filter((item) => includesNormalized(item.name, debouncedSearchText)),
    [debouncedSearchText],
  );

  const columns: { key: keyof TTs; label: string }[] = [
    { key: "name", label: "РўРѕСЂРіРѕРІР°СЏ С‚РѕС‡РєР°" },
    { key: "entity", label: "РћСЂРіР°РЅРёР·Р°С†РёСЏ" },
    { key: "codeTT", label: "РљРѕРґ РўРў" },
    { key: "codeObd", label: "РљРѕРґ РћР‘Р”" },
    { key: "type", label: "РўРёРї" },
    { key: "usersCount", label: "РџРѕР»СЊР·РѕРІР°С‚РµР»Рё" },
    { key: "cashCount", label: "РљР°СЃСЃС‹" },
    { key: "camsCount", label: "РљР°РјРµСЂС‹" },
    { key: "yandex", label: "РЇРЅРґРµРєСЃ Р•РґР°" },
    { key: "delivery", label: "Delivery Club" },
    { key: "dateOpen", label: "Р”Р°С‚Р° РѕС‚РєСЂС‹С‚РёСЏ" },
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
              placeholder="РџРѕРёСЃРє..."
            />
          </div>

          <TabNavigation
            items={["РўРѕСЂРіРѕРІС‹Рµ С‚РѕС‡РєРё", "Р—Р°РІРѕРґ", "РћС„РёСЃ", "РћСЂРіР°РЅРёР·Р°С†РёРё", "Р”РѕР»Р¶РЅРѕСЃС‚СЊ", "РўРёРїС‹", "РљР°СЃСЃРѕРІС‹Рµ РєР»РёРµРЅС‚С‹"]}
            activeIndex={activeIndex}
            onChange={handleClick}
          />
        </div>
      </div>

      <GenericTable<TTs>
        data={filteredData}
        columns={columns}
        loading={false}
        addOption={false}
        tableStateKey={tableStateKey}
        highlightQuery={debouncedSearchText}
      />
    </>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export default TT;
