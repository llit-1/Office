import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import useWindowSize from "../Hooks/useWindowSize";
import Header from "../Header/Header";
import HamburgerMenuDesktop from "../HamburgerMenuDesktop/HamburgerMenuDesktop";
import { HeaderMobile } from "../HeaderMobile/HeaderMobile";
import type { RootState } from "../Store";
import { get, post } from "../Services/api";
import type { OfficeNotification, UserDataApiNotification, UserDataApiResponse, UserDataResponse } from "../Interfaces/UserData";
import { clearUserData, setUserData } from "../Store/userDataSlice";
import "./App.css";

function normalizeNotification(item: UserDataApiNotification): OfficeNotification {
  return {
    id: item.id,
    dateTime: item.dateTime,
    typeId: item.typeId,
    officeUserId: item.officeUserId,
    relatedEntity: item.relatedEntity,
    status: item.status,
  };
}

function normalizeUserData(data: UserDataApiResponse): UserDataResponse {
  return {
    newNotifications: (data.newNotifications ?? []).map(normalizeNotification),
    activeNotifications: (data.activeNotifications ?? []).map(normalizeNotification),
    roles: Array.from(new Set(data.roles ?? [])),
  };
}

async function playNotificationBeep() {
  try {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const audioContext = new AudioContextCtor();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.28, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.2);

    oscillator.onended = () => {
      void audioContext.close();
    };
  } catch {
    // Browser can block audio until user interaction; keep polling working silently.
  }
}

function App() {
  const { width } = useWindowSize();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  const userId = useSelector((state: RootState) => state.auth.id);
  const token = useSelector((state: RootState) => state.auth.token);
  const effectiveUserId = (() => {
    if (typeof userId === "number" && !Number.isNaN(userId)) {
      return userId;
    }

    try {
      const persistedId = localStorage.getItem("id") || localStorage.getItem("userId");
      if (!persistedId) {
        return null;
      }

      const parsedId = Number(persistedId);
      return Number.isNaN(parsedId) ? null : parsedId;
    } catch {
      return null;
    }
  })();

  // состояние меню
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  // Redirect to Main only when at the root path.
  useEffect(() => {
    const path = location.pathname || "/";
    if (path === "/" || path === "") {
      navigate("Main", { replace: true });
    }
  }, [location.pathname]);

  useEffect(() => {
    if(width > 500 && width < 1000)
    {
      setIsMenuOpen(false)
      return
    }

    if(width > 1000)
    {
      setIsMenuOpen(true)
    }


  }, [width]);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme === "dark" || savedTheme === "light") {
        document.documentElement.setAttribute("data-theme", savedTheme);
        return;
      }
    } catch {
      // ignore localStorage issues
    }
    document.documentElement.setAttribute("data-theme", "light");
  }, []);

  useEffect(() => {
    if (!token || effectiveUserId === null) {
      dispatch(clearUserData());
      return;
    }

    let cancelled = false;

    const loadUserData = async () => {
      try {
        const data = await get<UserDataApiResponse>("/DataUpdate/getdata", {
          params: { userId: effectiveUserId },
        });

        const normalizedData = normalizeUserData(data);
        const newNotificationIds = normalizedData.newNotifications.map((item) => item.id);

        if (newNotificationIds.length > 0) {
          await playNotificationBeep();

          try {
            await post("/Notification/setnotificationsstatusone", newNotificationIds);
            normalizedData.activeNotifications = [
              ...normalizedData.newNotifications.map((item) => ({ ...item, status: 1 })),
              ...normalizedData.activeNotifications,
            ].sort((left, right) => new Date(right.dateTime).getTime() - new Date(left.dateTime).getTime());
            normalizedData.newNotifications = [];
          } catch (statusUpdateError) {
            console.error("Failed to update notification statuses", statusUpdateError);
          }
        }

        if (!cancelled) {
          dispatch(setUserData(normalizedData));
        }
      } catch (error) {
        console.error("Failed to refresh user data", error);
      }
    };

    void loadUserData();

    const intervalId = window.setInterval(() => {
      void loadUserData();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [dispatch, token, effectiveUserId]);

  return (
    <>
      <main>
        {width >= 750 ? (
          <Header isMenuOpen={isMenuOpen} setIsMenuOpen={setIsMenuOpen} />
        ) : (
          <HeaderMobile />
        )}

        <div className="containerForMain">
          <div className="mainWrapper">
            {width >= 750 && (
              <HamburgerMenuDesktop
                isMenuOpen={isMenuOpen}
                setIsMenuOpen={setIsMenuOpen}
              />
            )}
            <div className="main">
              <Outlet />
            </div>
          </div>

          <footer className="main_footer">{import.meta.env.VITE_VERSION}</footer>
        </div>
      </main>
    </>
  );
}

export default App;
