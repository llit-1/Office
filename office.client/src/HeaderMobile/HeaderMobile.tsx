import {useState, useCallback} from 'react'
import styles from "./HeaderMobile.module.css"
import Hamburger from 'hamburger-react';
import {Drawer} from "@mui/material"
import { useSelector } from "react-redux";
import { RootState } from "../Store/index";
import { useNavigate } from "react-router-dom"


export const HeaderMobile = () => {

    const navigate = useNavigate()

    const [isOpen, setIsOpen] = useState(false);

    const title = useSelector((state: RootState) => state.pageTitle.title);

    const toggleDrawer = useCallback((open: boolean) => () => {
        setIsOpen(open);
    }, []);

    return (
        <header className={styles.header} onClick={() => navigate("/Main")}>
            <Drawer anchor="left" open={isOpen} onClose={toggleDrawer(false)}>
                <div className={styles.hamburger}>
                    <Hamburger size={20} color="white"/>
                </div>
            </Drawer>
            <p>{title}</p>
            <div className={styles.logo} ></div>
        </header>
      )
}
