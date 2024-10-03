import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App/App'
import store from './Store/index'
import { Provider } from "react-redux";
import { BrowserRouter, Routes, Route } from "react-router-dom"
import Login from "./Pages/Login/Login"
import "../public/Fonts/Akrobat/akrobat.css"
import TT from "./Pages/TT/TT"
import NotFound from "./Pages/NotFound/NotFound"
import Calculator from './Pages/Calculator/Calculator';
import Users from "./Pages/Users/Users"
import Settings from "./Pages/Settings/Settings"
import Help from "./Pages/Help/Help"
import Main from "./Pages/Main/Main"
import { NotificationsProvider } from '@toolpad/core';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
      <Provider store={store}>
          <BrowserRouter>
            <NotificationsProvider>

              <Routes>

                <Route path='/' element={<App />}>
                  <Route path="Main" element={<Main />} />
                  <Route path="Calculator" element={<Calculator />} />
                  <Route path="TT" element={<TT />} />
                  <Route path="Users" element={<Users />} />
                  <Route path="Settings" element={<Settings />} />
                  <Route path="Help" element={<Help />} /> 
                  <Route path="*" element={<NotFound />} />
                </Route>

                <Route path='/Login' element={<Login />} />

              </Routes>

            </NotificationsProvider>
          </BrowserRouter>
      </Provider>

  </StrictMode>,
)
