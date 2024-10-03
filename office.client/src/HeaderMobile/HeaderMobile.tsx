import React, {useState, useCallback} from 'react'
import styles from "./HeaderMobile.module.css"
import Hamburger from 'hamburger-react';
import {Drawer} from "@mui/material"

export const HeaderMobile = () => {

    const [isOpen, setIsOpen] = useState(false);

    const toggleDrawer = useCallback((open: boolean) => () => {
        setIsOpen(open);
    }, []);

    return (
        <header className={styles.header}>
            <Drawer anchor="left" open={isOpen} onClose={toggleDrawer(false)}>
                <div className={styles.hamburger}>
                    <Hamburger size={20} color="white"/>
                </div>
            </Drawer>
            <p>Главная</p>
            <div className={styles.logo} ></div>
        </header>
      )
}
