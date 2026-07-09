import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
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
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    dispatch(visibleSet({ visible: true }));
    dispatch(pathSet({ path: "/" }));
  }, [dispatch]);

  useEffect(() => {
    dispatch(titleSet({ title: ttTabs[activeIndex] }));
  }, [activeIndex, dispatch]);

  return (
    <>
      <div className={styles.tt_wrapper}>
        <div className={styles.tabAndSearchWrapper}>
          <TabNavigation items={[...ttTabs]} activeIndex={activeIndex} onChange={setActiveIndex} />
        </div>
      </div>

      <div className={styles.page}>
        {activeIndex === 0 && <TradePointsTab />}
        {activeIndex === 1 && <FactoryLocationsTab />}
        {activeIndex === 2 && <OfficeLocationsTab />}
        {activeIndex === 3 && <EntitiesTab />}
        {activeIndex === 4 && <JobTitlesTab />}
        {activeIndex === 5 && <LocationTypesTab />}
      </div>
    </>
  );
}
