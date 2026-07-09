import styles from "./Header.module.css";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../Store";
import { useNavigate } from "react-router-dom";
import Hamburger from "hamburger-react";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import { useEffect, useRef, useState } from "react";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { setNotificationSoundEnabled } from "../Store/preferencesSlice";
import { logout } from "../Store/authSlice";
import { clearUserData } from "../Store/userDataSlice";
import { logoutSession } from "../Services/api";
import { navigateWithPreloadedRoute, preloadRouteForPath } from "../App/routes";

interface HeaderProps {
  isMenuOpen: boolean;
  setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

const Header: React.FC<HeaderProps> = ({ isMenuOpen, setIsMenuOpen }) => {
  const title = useSelector((state: RootState) => state.pageTitle.title);
  const visible = useSelector((state: RootState) => state.backButton.visible);
  const path = useSelector((state: RootState) => state.backButton.path);
  const notificationsCount = useSelector(
    (state: RootState) =>
      state.userData.newNotifications.length +
      state.userData.activeNotifications.length,
  );
  const notificationSoundEnabled = useSelector(
    (state: RootState) => state.preferences.notificationSoundEnabled,
  );
  const fullName = useSelector((state: RootState) => state.auth.fullName);
  const position = useSelector((state: RootState) => state.auth.position);
  const navigate = useNavigate();
  const dispatch = useDispatch();

  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme === "dark" || savedTheme === "light") {
        return savedTheme;
      }
    } catch {
      // ignore localStorage issues
    }

    return "light";
  });

  const profileRef = useRef<HTMLDivElement | null>(null);

  const toggleProfileMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsProfileMenuOpen((prev) => !prev);
  };

  const closeProfileMenu = () => setIsProfileMenuOpen(false);

  useEffect(() => {
    if (isMenuOpen) {
      closeProfileMenu();
    }
  }, [isMenuOpen]);

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        closeProfileMenu();
      }
    };

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeProfileMenu();
      }
    };

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onEsc);

    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [isProfileMenuOpen]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);

    try {
      localStorage.setItem("theme", theme);
    } catch {
      // ignore localStorage issues
    }
  }, [theme]);

  const handleLogout = async () => {
    closeProfileMenu();
    await logoutSession();
    dispatch(clearUserData());
    dispatch(logout());
    navigate("/Login", { replace: true });
  };

  return (
    <header className={styles.header}>
      <div
        className={`${styles.hamburgerWrapper} ${
          isMenuOpen ? styles.hamburgerWrapperExpanded : styles.hamburgerWrapperCollapsed
        }`}
      >
        <div
          className={`${styles.hamburger_logo} ${
            isMenuOpen ? styles.hamburgerLogoExpanded : styles.hamburgerLogoCollapsed
          }`}
        >
          <div className={styles.hamburger_logo_img}></div>
          <div className={styles.hamburger_logo_text}>
            <div>Корпоративный</div>
            <div>Портал</div>
          </div>
        </div>

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
        <div className={styles.button_back} onClick={() => void navigateWithPreloadedRoute(navigate, path)}>
          <ArrowBackIosNewIcon />
        </div>
      )}

      <div
        className={styles.header_title}
        onMouseEnter={() => void preloadRouteForPath("/Main")}
        onClick={() => void navigateWithPreloadedRoute(navigate, "/Main")}
      >
        {title}
      </div>

      <div
        className={styles.button_notifications}
        data-count={notificationsCount > 99 ? "99+" : String(notificationsCount)}
        data-has-notifications={notificationsCount > 0}
        onMouseEnter={() => void preloadRouteForPath("/Notifications")}
        onClick={() => void navigateWithPreloadedRoute(navigate, "/Notifications")}
      >
        <NotificationsNoneIcon />
      </div>

      <div ref={profileRef} className={styles.profileWrapper}>
        <div className={styles.header_logo} onClick={toggleProfileMenu} />

        {isProfileMenuOpen && (
          <div className={styles.profileMenu} onClick={(e) => e.stopPropagation()}>
            <p>{fullName?.trim() || "Пользователь"}</p>
            <p className={styles.profileMenuTextJob}>{position?.trim() || "Должность не указана"}</p>

            <div className={styles.themeSwitchRow}>
              <span>Тёмная тема</span>
              <button
                type="button"
                role="switch"
                aria-checked={theme === "dark"}
                className={`${styles.themeSwitch} ${theme === "dark" ? styles.themeSwitchActive : ""}`}
                onClick={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
              >
                <span className={styles.themeSwitchThumb}></span>
              </button>
            </div>

            <div className={styles.themeSwitchRow}>
              <span>Звук уведомлений</span>
              <button
                type="button"
                role="switch"
                aria-checked={notificationSoundEnabled}
                className={`${styles.themeSwitch} ${notificationSoundEnabled ? styles.themeSwitchActive : ""}`}
                onClick={() =>
                  dispatch(setNotificationSoundEnabled(!notificationSoundEnabled))
                }
              >
                <span className={styles.themeSwitchThumb}></span>
              </button>
            </div>

            <button onClick={() => void handleLogout()}>
              Выйти
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
