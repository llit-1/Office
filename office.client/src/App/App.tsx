import './App.css';
import HamburgerMenuDesktop from '../HamburgerMenuDesktop/HamburgerMenuDesktop';
import Header from "../Header/Header"
import useWindowSize from '../Hooks/useWindowSize';
import { Outlet, useNavigate } from "react-router-dom"
import {HeaderMobile} from "../HeaderMobile/HeaderMobile"
import { useEffect } from 'react';


function App() {
    // Хук для вычиления размеров экрана, чтобы подкинуть правильное меню
    const { width } = useWindowSize();
    const navigate = useNavigate()

    useEffect(() => {
        navigate("Main")
    }, [])

    return (
        <>
            {/* <Login /> */}
            <main>
                {width >= 500 && <HamburgerMenuDesktop />}
                
                <div className='containerForMain'>
                    {width >= 500 ? <Header /> : <HeaderMobile/> }
                    <div className='main'>
                        <Outlet />
                    </div>
                    <footer className={"main_footer"}> {import.meta.env.VITE_VERSION} </footer>
                </div>
            </main>

            {/* <SnackBarCustom
                isOpen={notification.isOpen}
                isGood={notification.isGood}
                message={notification.message}
                onClose={handleCloseSnackbar}
            /> */}
        </>
    );

   
}

export default App;