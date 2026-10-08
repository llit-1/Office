import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate, useParams } from "react-router-dom";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import type { RootState } from "../../Store";
import { visibleSet, pathSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import styles from "./Stock.module.css";
import StockCardPage from "./StockCardPage";
import StockSearchPage from "./StockSearchPage";
import StockStructurePage from "./StockStructurePage";
import StockTransferPage from "./StockTransferPage";

const STOCK_ADMIN_ROLE = "StockAdmin";
const DEFAULT_TAB_PATH = "/Stock/Transfer";

const Stock = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { tab } = useParams();
  const isStockAdmin = useSelector((state: RootState) => state.userData.roles.includes(STOCK_ADMIN_ROLE));

  const tabs = useMemo(
    () => [
      ...(isStockAdmin ? [{ key: "Structure", label: "Структура" }] : []),
      { key: "Transfer", label: "Передача" },
      { key: "Search", label: "Поиск" },
      { key: "Card", label: "Карточка" },
    ],
    [isStockAdmin],
  );

  const activeIndex = tabs.findIndex((item) => item.key === tab);
  const activeKey = tabs[activeIndex]?.key;

  useEffect(() => {
    dispatch(pathSet({ path: "/Main" }));
    dispatch(visibleSet({ visible: true }));
    dispatch(titleSet({ title: "Склад" }));
  }, [dispatch]);

  useEffect(() => {
    if (activeIndex !== -1) return;
    navigate(DEFAULT_TAB_PATH, { replace: true });
  }, [activeIndex, navigate]);

  return (
    <>
      <div className={styles.tt_wrapper}>
        <TabNavigation
          items={tabs.map((item) => item.label)}
          activeIndex={Math.max(activeIndex, 0)}
          onChange={(index) => navigate(`/Stock/${tabs[index].key}`)}
        />
      </div>

      {activeKey === "Structure" && <StockStructurePage />}
      {activeKey === "Transfer" && <StockTransferPage />}
      {activeKey === "Search" && <StockSearchPage />}
      {activeKey === "Card" && <StockCardPage />}
    </>
  );
};

export default Stock;
