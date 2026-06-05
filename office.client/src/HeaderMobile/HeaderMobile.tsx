import { useEffect, useRef, useState } from "react";
import styles from "./HeaderMobile.module.css";
import Hamburger from "hamburger-react";
import NotificationsNoneIcon from "@mui/icons-material/NotificationsNone";
import { useDispatch, useSelector } from "react-redux";
import type { RootState } from "../Store";
import { useNavigate } from "react-router-dom";
import { HamburgerMenuMobile } from "../HamburgerMenuMobile/HamburgerMenuMobile";
import { setNotificationSoundEnabled } from "../Store/preferencesSlice";

const getStoredUserProfile = () => {
  try {
    return {
      fullName: localStorage.getItem("userFullName")?.trim() || "Пользователь",
      position: localStorage.getItem("userPosition")?.trim() || "Должность не указана",
    };
  } catch {
    return {
      fullName: "Пользователь",
      position: "Должность не указана",
    };
  }
};

export const HeaderMobile = () => {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [isOpen, setIsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const title = useSelector((state: RootState) => state.pageTitle.title);
  const notificationsCount = useSelector(
    (state: RootState) =>
      state.userData.newNotifications.length +
      state.userData.activeNotifications.length
  );
  const notificationSoundEnabled = useSelector(
    (state: RootState) => state.preferences.notificationSoundEnabled
  );
  const [userProfile] = useState(getStoredUserProfile);
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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);

    try {
      localStorage.setItem("theme", theme);
    } catch {
      // ignore localStorage issues
    }
  }, [theme]);

  useEffect(() => {
    if (isOpen) {
      setIsProfileMenuOpen(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isProfileMenuOpen) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (profileRef.current && !profileRef.current.contains(target)) {
        setIsProfileMenuOpen(false);
      }
    };

    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
      }
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
      <div className={styles.hamburger}>
        <Hamburger toggled={isOpen} toggle={setIsOpen} size={20} color="white" />
      </div>

      <p onClick={() => navigate("/Main")}>{title}</p>

      <div
        className={styles.buttonNotifications}
        data-count={notificationsCount > 99 ? "99+" : String(notificationsCount)}
        data-has-notifications={notificationsCount > 0}
        onClick={() => navigate("/Notifications")}
      >
        <NotificationsNoneIcon />
      </div>

      <div ref={profileRef} className={styles.profileWrapper}>
        <div
          className={styles.logo}
          onClick={() => setIsProfileMenuOpen((prev) => !prev)}
        ></div>

        {isProfileMenuOpen && (
          <div className={styles.profileMenu} onClick={(e) => e.stopPropagation()}>
            <p>{userProfile.fullName}</p>
            <p className={styles.profileMenuTextJob}>{userProfile.position}</p>

            <div className={styles.themeSwitchRow}>
              <span>Тёмная тема</span>
              <button
                type="button"
                role="switch"
                aria-checked={theme === "dark"}
                className={`${styles.themeSwitch} ${
                  theme === "dark" ? styles.themeSwitchActive : ""
                }`}
                onClick={() =>
                  setTheme((prev) => (prev === "dark" ? "light" : "dark"))
                }
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
                className={`${styles.themeSwitch} ${
                  notificationSoundEnabled ? styles.themeSwitchActive : ""
                }`}
                onClick={() =>
                  dispatch(setNotificationSoundEnabled(!notificationSoundEnabled))
                }
              >
                <span className={styles.themeSwitchThumb}></span>
              </button>
            </div>

            <button
              onClick={() => {
                setIsProfileMenuOpen(false);
                navigate("/Login");
              }}
            >
              Выйти
            </button>
          </div>
        )}
      </div>

      <HamburgerMenuMobile isOpen={isOpen} setIsOpen={setIsOpen} />
    </header>
  );
};
