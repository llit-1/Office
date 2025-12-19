import styles from "./Header.module.css";
import { useSelector } from "react-redux";
import { RootState } from "../Store";
import { useNavigate } from "react-router-dom";
import Hamburger from "hamburger-react";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import { useEffect } from "react";

interface HeaderProps {
  isMenuOpen: boolean;
  setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const Header: React.FC<HeaderProps> = ({ isMenuOpen, setIsMenuOpen }) => {
  const title = useSelector((state: RootState) => state.pageTitle.title);
  const visible = useSelector((state: RootState) => state.backButton.visible);
  const path = useSelector((state: RootState) => state.backButton.path);
  const navigate = useNavigate();

  useEffect(() => {
    
  }, [isMenuOpen])

  return (
    <header className={styles.header}>
      <div className={styles.hamburgerWrapper}>
        {isMenuOpen ? (
          <div className={styles.hamburger_logo}></div>
        ) : (
          <div className={styles.hamburger_logo_hidden_text}></div>
        )}

        <div className={styles.hamburger}>
          <Hamburger
            toggled={isMenuOpen}
            toggle={setIsMenuOpen}
            size={20}
            color="white"
          />
        </div>
      </div>

      {visible && (
        <div className={styles.button_back} onClick={() => navigate(path)}>
          <ArrowBackIosNewIcon />
        </div>
      )}

      <div className={styles.header_title} onClick={() => navigate("/Main")}>
        {title}
      </div>

      <div className={styles.header_logo}></div>
    </header>
  );
};

export default Header;
