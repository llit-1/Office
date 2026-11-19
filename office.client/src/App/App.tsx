import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import useWindowSize from "../Hooks/useWindowSize";
import Header from "../Header/Header";
import HamburgerMenuDesktop from "../HamburgerMenuDesktop/HamburgerMenuDesktop";
import { HeaderMobile } from "../HeaderMobile/HeaderMobile";
import useUserDataPolling from "../Hooks/useUserDataPolling";
import { navigateWithPreloadedRoute } from "./routes";
import ImpersonationBanner from "../Components/ImpersonationBanner/ImpersonationBanner";
import "./App.css";

let notificationAudioContext: AudioContext | null = null;
let notificationAudioBuffer: AudioBuffer | null = null;
let notificationAudioBufferPromise: Promise<AudioBuffer | null> | null = null;
let notificationHtmlAudio: HTMLAudioElement | null = null;

const notificationSoundPath = "/songs/notification.mp3";
const notificationSoundVolume = 0.2;

function getHtmlAudio() {
  if (!notificationHtmlAudio) {
    notificationHtmlAudio = new Audio(notificationSoundPath);
    notificationHtmlAudio.preload = "auto";
    notificationHtmlAudio.volume = notificationSoundVolume;
  }

  return notificationHtmlAudio;
}

function getAudioContext() {
  if (notificationAudioContext) {
    return notificationAudioContext;
  }

  const AudioContextCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    return null;
  }

  notificationAudioContext = new AudioContextCtor();
  return notificationAudioContext;
}

async function loadNotificationAudioBuffer() {
  if (notificationAudioBuffer) {
    return notificationAudioBuffer;
  }

  if (notificationAudioBufferPromise) {
    return notificationAudioBufferPromise;
  }

  notificationAudioBufferPromise = (async () => {
    try {
      const audioContext = getAudioContext();
      if (!audioContext) {
        return null;
      }

      const response = await fetch(notificationSoundPath);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      notificationAudioBuffer = audioBuffer;
      return audioBuffer;
    } catch {
      return null;
    } finally {
      notificationAudioBufferPromise = null;
    }
  })();

  return notificationAudioBufferPromise;
}

async function playNotificationBeep() {
  try {
    const audioContext = getAudioContext();
    if (!audioContext) {
      const htmlAudio = getHtmlAudio();
      htmlAudio.currentTime = 0;
      await htmlAudio.play();
      return;
    }

    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    const audioBuffer = await loadNotificationAudioBuffer();
    if (!audioBuffer) {
      return;
    }

    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    source.buffer = audioBuffer;
    gainNode.gain.value = notificationSoundVolume;
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    source.start(0);
  } catch {
    try {
      const htmlAudio = getHtmlAudio();
      htmlAudio.currentTime = 0;
      await htmlAudio.play();
    } catch {
      // Keep polling working silently if the browser blocks sound.
    }
  }
}

function App() {
  const { width } = useWindowSize();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    const path = location.pathname || "/";
    if (path === "/" || path === "") {
      void navigateWithPreloadedRoute(navigate, "/Main", { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    if (width > 500 && width < 1000) {
      setIsMenuOpen(false);
      return;
    }

    if (width > 1000) {
      setIsMenuOpen(true);
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
    const unlockAudio = async () => {
      try {
        const audioContext = getAudioContext();
        if (audioContext && audioContext.state === "suspended") {
          await audioContext.resume();
        }

        void loadNotificationAudioBuffer();
      } catch {
        // ignore audio unlock issues
      }
    };

    document.addEventListener("pointerdown", unlockAudio, { once: true });
    document.addEventListener("keydown", unlockAudio, { once: true });

    return () => {
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };
  }, []);

  useUserDataPolling(playNotificationBeep);

  return (
    <>
      <ImpersonationBanner />
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
