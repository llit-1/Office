import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useSearchParams } from "react-router-dom";
import TabNavigation from "../../Components/TabNaviagtion/TabNavigation";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";
import styles from "./TT.module.css";
import FactoryLocationsTab from "./tabs/FactoryLocationsTab";
import EntitiesTab from "./tabs/EntitiesTab";
import JobTitlesTab from "./tabs/JobTitlesTab";
import LocationTypesTab from "./tabs/LocationTypesTab";
import OfficeLocationsTab from "./tabs/OfficeLocationsTab";
import TradePointsTab from "./tabs/TradePointsTab";
import { ttTabs } from "./ttModels";

export default function TT() {
  const dispatch = useDispatch();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeIndex = Math.max(0, ttTabs.findIndex((tab) => tab.key === searchParams.get("tab")));
  const activeKey = ttTabs[activeIndex].key;

  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(pathSet({ path: "/" }));
  }, [dispatch]);

  useEffect(() => {
    dispatch(titleSet({ title: ttTabs[activeIndex].label }));
  }, [activeIndex, dispatch]);

  return (
    <>
      <div className={styles.tt_wrapper}>
        <div className={styles.tabAndSearchWrapper}>
          <TabNavigation
            items={ttTabs.map((tab) => tab.label)}
            activeIndex={activeIndex}
            onChange={(index) => setSearchParams(index === 0 ? {} : { tab: ttTabs[index].key }, { replace: true })}
          />
        </div>
      </div>

      <div className={styles.page}>
        {activeKey === "trade" && <TradePointsTab />}
        {activeKey === "factory" && <FactoryLocationsTab />}
        {activeKey === "office" && <OfficeLocationsTab />}
        {activeKey === "entities" && <EntitiesTab />}
        {activeKey === "jobtitles" && <JobTitlesTab />}
        {activeKey === "types" && <LocationTypesTab />}
      </div>
    </>
  );
}
