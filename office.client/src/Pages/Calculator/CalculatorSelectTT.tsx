import { useDispatch } from "react-redux";
import styles from "./CalculatorSelectTT.module.css";
import CalculatorTile from "./CalculatorTile";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { useEffect, useMemo, useState } from "react";
import SearchIcon from "@mui/icons-material/Search";
import { useNavigate } from "react-router-dom";
import { callApi, get } from "../../Services/api";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import LoadingSpinner from "../../Components/LoadingSpinner/LoadingSpinner";

interface Location {
  actual: 0 | 1;
  aggregatorsCode: number;
  guid: string;
  name: string;
  rkCode: number;
}

const CalculatorSelectTT = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  const [searchText, setSearchText] = useState("");
  const [data, setData] = useState<Location[] | null>(null);
  const [loading, setLoading] = useState(true);


  const getTTList = async (): Promise<Location[] | null> => {
    const result = await callApi(get<Location[]>("/Calculator/ttList"));

    if (result.ok) return result.data;
    return null;
  };


useEffect(() => {
  dispatch(pathSet({ path: "/Calculator/SelectCategory" }));
  dispatch(visibleSet({ visible: true  }));
  dispatch(titleSet({ title: "Выбор ТТ" }));

  (async () => {
    const ttList = await getTTList();
    setLoading(false);

    if (!ttList) {
      setData(null);
      return;
    }

    if (!ttList || ttList.length === 0) {
      setData(null);
      return;
    }

    if (ttList.length === 1) {
      navigate("/Calculator/Calculate/" + ttList[0].guid);
      return;
    }

    setLoading(false);
    setData(ttList);
  })();
}, [dispatch, navigate]);

  const filteredData = useMemo(() => {
    if (!data) return [];
    const lower = searchText.toLowerCase();
    return data.filter((item) =>
      item.name.toLowerCase().includes(lower)
    );
  }, [searchText, data]);

  const showSearch = !!data && data.length > 5;

  return (
    <>
      {loading ? (<LoadingSpinner />) : (
        <>
          {showSearch ? (
            <div className={styles.searchWrapper}>
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
            </div>
          ) : !data ? (
            <div className={styles.textDataNull}>За вами не закреплена ни одна ТТ, обратитесь к администратору</div>
          ) : null}

          <div className={styles.calculator_wrapper}>
            {!data ? null : filteredData.length === 0 ? (
              <p className={styles.badSearch}>По указанным данным ТТ не найдено</p>
            ) : (
              filteredData.map((item) => (
                <CalculatorTile key={item.guid} id={item.guid} value={item.name} />
              ))
            )}
          </div>
        </>
      )}
    </>
  );
};

export default CalculatorSelectTT;
