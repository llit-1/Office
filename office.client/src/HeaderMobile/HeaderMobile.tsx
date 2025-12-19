import { useState } from "react";
import styles from "./HeaderMobile.module.css";
import Hamburger from "hamburger-react";
import { useSelector } from "react-redux";
import { RootState } from "../Store";
import { useNavigate } from "react-router-dom";
import { HamburgerMenuMobile } from "../HamburgerMenuMobile/HamburgerMenuMobile";

export const HeaderMobile = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const title = useSelector((state: RootState) => state.pageTitle.title);

  return (
    <header className={styles.header}>
      <div className={styles.hamburger}>
        <Hamburger toggled={isOpen} toggle={setIsOpen} size={20} color="white" />
      </div>

      <p onClick={() => navigate("/Main")}>{title}</p>

      <div className={styles.logo}></div>

      <HamburgerMenuMobile isOpen={isOpen} setIsOpen={setIsOpen} />
    </header>
  );
};
