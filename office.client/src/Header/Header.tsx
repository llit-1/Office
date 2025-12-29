import styles from "./Header.module.css";
import { useSelector } from "react-redux";
import { RootState } from "../Store";
import { useNavigate } from "react-router-dom";
import Hamburger from "hamburger-react";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import { useEffect, useRef, useState } from "react";
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';

interface HeaderProps {
  isMenuOpen: boolean;
  setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const Header: React.FC<HeaderProps> = ({ isMenuOpen, setIsMenuOpen }) => {
  const title = useSelector((state: RootState) => state.pageTitle.title);
  const visible = useSelector((state: RootState) => state.backButton.visible);
  const path = useSelector((state: RootState) => state.backButton.path);
  const navigate = useNavigate();

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  // ref на контейнер (лого + меню), чтобы понимать “кликнули вне”
  const profileRef = useRef<HTMLDivElement | null>(null);

  const toggleProfileMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsProfileMenuOpen((prev) => !prev);
  };

  const closeProfileMenu = () => setIsProfileMenuOpen(false);

  // Закрывать профиль-меню при открытии hamburger-меню (если нужно)
  useEffect(() => {
    if (isMenuOpen) closeProfileMenu();
  }, [isMenuOpen]);

  // Закрытие по клику вне + по Escape
  useEffect(() => {
    if (!isProfileMenuOpen) return;

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!profileRef.current) return;

      if (!profileRef.current.contains(target)) {
        closeProfileMenu();
      }
    };

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeProfileMenu();
    };

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [isProfileMenuOpen]);

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

      <div className={styles.button_notifications} onClick={() => navigate("/Notifications")}>
          <NotificationsNoneIcon />
      </div>

      {/* Важно: ref на общий контейнер */}
      <div ref={profileRef} className={styles.profileWrapper}>
        <div className={styles.header_logo} onClick={toggleProfileMenu} />

        {isProfileMenuOpen && (
          <div className={styles.profileMenu} onClick={(e) => e.stopPropagation()}>
            <p>Кургузов Владислав Сергеевич</p>
            <p className={styles.profileMenuTextJob}>Программист-разработчик</p>

            <button
              onClick={() => {
                closeProfileMenu();
                // тут твоя логика выхода (dispatch logout / navigate)
                navigate("/Login");
              }}
            >
              Выйти
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
