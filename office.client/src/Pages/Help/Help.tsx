import styles from "./Help.module.css";
import { useState, useEffect, useCallback } from "react";
import { useDispatch } from "react-redux";
import { pathSet, visibleSet } from "../../Store/stateForBackButtonSlice";
import { titleSet } from "../../Store/stateForPageTitleSlice";

const Help = () => {

    return (
        <div className={styles.wrapper }>
            
        </div>
    );
};

export default Help;