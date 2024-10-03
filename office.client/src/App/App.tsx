import './App.css';
import HamburgerMenuDesktop from '../HamburgerMenuDesktop/HamburgerMenuDesktop';
import Header from "../Header/Header"
import useWindowSize from '../Hooks/useWindowSize';
// import {useAppSelector, useAppDispatch} from "../Hooks/hook"
// import { hideNotification } from '../Store/notificationSlice
//import SnackBarCustom from "./Components/SnackBarCustom.tsx";
import { Outlet} from "react-router-dom"

import {HeaderMobile} from "../HeaderMobile/HeaderMobile"


function App() {
    // const dispatch = useAppDispatch();
    // const [isAuth, setIsAuth] = useState<boolean>(false);
    // const notification = useAppSelector(state => state.notification);

    // const handleCloseSnackbar = () => {
    //     dispatch(hideNotification());
    // };

    // Хук для вычиления размеров экрана, чтобы подкинуть правильное меню
    const { width } = useWindowSize();


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