import { createRoot } from 'react-dom/client'
import App from './App/App'
import store, { persistor } from './Store/index'
import { Provider } from "react-redux";
import { BrowserRouter, Routes, Route } from "react-router-dom"
import { PersistGate } from "redux-persist/integration/react";
import Login from "./Pages/Login/Login"
import "../public/Fonts/Akrobat/akrobat.css"
import TT from "./Pages/TT/TT"
import NotFound from "./Pages/NotFound/NotFound"
import Users from "./Pages/Users/Users"
import Settings from "./Pages/Settings/Settings"
import Help from "./Pages/Help/Help"
import Main from "./Pages/Main/Main"
import { NotificationsProvider } from '@toolpad/core';
import CalculatorCategories from './Pages/Calculator/CalculatorCategories';
import Calculate from './Pages/Calculator/Calculate';
import CalculatorSelectTT from './Pages/Calculator/CalculatorSelectTT';
import Calculator from './Pages/Calculator/Calculator';
import FactoryNX from './Pages/FactoryNX/FactoryNX';
import "./styles/design-tokens.css";
import UserEdit from './Pages/Users/UserEdit';
import Orders from './Pages/Orders/Orders';

createRoot(document.getElementById('root')!).render(
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <BrowserRouter>
            <NotificationsProvider slotProps={{
              snackbar: {
                anchorOrigin: { vertical: 'top', horizontal: 'right' },
              },
            }}>
                <Routes>

                  <Route path='/' element={<App /> }>
                    <Route path="Main" element={<Main />} />

                    <Route path="Calculator" element={<Calculator />}>
                      <Route path="SelectCategory" element={<CalculatorCategories />}/>
                      <Route path="SelectTT" element={<CalculatorSelectTT />}/>
                      <Route path="Calculate/:Location" element={<Calculate />}/>
                    </Route>

                    <Route path="TT" element={<TT />}/>
                    <Route path="Users" element={<Users />} />
                    <Route path="/Users/Edit/" element={<UserEdit />} />
                    <Route path="Settings" element={<Settings />} />
                    <Route path="Help" element={<Help />} /> 
                    <Route path="*" element={<NotFound />} />

                    <Route path='FactoryNX' element={<FactoryNX />} />
                    <Route path='Orders' element={<Orders />} />
                  </Route>

                  <Route path='/Login' element={<Login />} />

                </Routes>

            </NotificationsProvider>
          </BrowserRouter>
        </PersistGate>
      </Provider>
)
