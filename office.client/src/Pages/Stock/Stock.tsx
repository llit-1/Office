import { useEffect, useMemo } from "react";
import { useDispatch } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import styles from "./Stock.module.css";
import StockStructurePage from "./StockStructurePage";
import StockTransferPage from "./StockTransferPage";
import StockSearchPage from "./StockSearchPage";
import StockStubPage from "./StockStubPage";

const Stock = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { tab } = useParams();

  const tabs = useMemo(
    () => [
      { key: "Structure", label: "Структура" },
      { key: "Transfer", label: "Передача" },
      { key: "Search", label: "Поиск" },
      { key: "Card", label: "Карточка" },
    ],
    [],
  );

  const activeIndex = tabs.findIndex((item) => item.key === tab);

  useEffect(() => {
    dispatch(pathSet({ path: "/Main" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Склад" }));
  }, [dispatch]);

  useEffect(() => {
    if (activeIndex !== -1) return;
    navigate("/Stock/Structure", { replace: true });
  }, [activeIndex, navigate]);

  return (
    <>
      <div className={styles.tt_wrapper}>
        <TabNavigation
          items={tabs.map((item) => item.label)}
          activeIndex={activeIndex >= 0 ? activeIndex : 0}
          onChange={(index) => navigate(`/Stock/${tabs[index].key}`)}
        />
      </div>

      {activeIndex === 0 && <StockStructurePage />}
      {activeIndex === 1 && <StockTransferPage />}
      {activeIndex === 2 && <StockSearchPage />}
      {activeIndex === 3 && <StockStubPage />}
    </>
  );
};

export default Stock;
