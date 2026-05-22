import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import useWindowSize from "../Hooks/useWindowSize";
import Header from "../Header/Header";
import HamburgerMenuDesktop from "../HamburgerMenuDesktop/HamburgerMenuDesktop";
import { HeaderMobile } from "../HeaderMobile/HeaderMobile";
import "./App.css";

function App() {
  const { width } = useWindowSize();
  const navigate = useNavigate();
  const location = useLocation();

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
