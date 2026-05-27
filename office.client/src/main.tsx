import { createRoot } from 'react-dom/client'
import { useEffect } from 'react'
import App from './App/App'
import store, { persistor, RootState } from './Store/index'
import { Provider } from "react-redux";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom"
import { useSelector, useDispatch } from 'react-redux'
import { login } from './Store/authSlice'
import { PersistGate } from "redux-persist/integration/react";
import Login from "./Pages/Login/Login"
import RequireAuth from "./App/RequireAuth";
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
import Notifications from './Pages/Notifications/Notifications';
import GroupEdit from './Pages/Users/GroupEdit';
import RoleEdit from './Pages/Users/RoleEdit';
import FactoryPerson from './Pages/FactoryPerson/FactoryPerson'
import FactoryPersonEdit from './Pages/FactoryPerson/FactoryPersonEdit'
import Stock from './Pages/Stock/Stock'
import StockTable from './Pages/Stock/StockTable';
import SalaryPage from './Pages/Salary/SalaryPage';
import SalarySettingsPage from './Pages/Salary/SalarySettingsPage';

try {
  const savedTheme = localStorage.getItem("theme");
  if (savedTheme === "dark" || savedTheme === "light") {
    document.documentElement.setAttribute("data-theme", savedTheme);
  } else {
    document.documentElement.setAttribute("data-theme", "light");
  }
} catch {
  document.documentElement.setAttribute("data-theme", "light");
}

function StartupChecker() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const token = useSelector((s: RootState) => s.auth?.token);
  const id = useSelector((s: RootState) => s.auth?.id);

  useEffect(() => {
    try {
      const lsToken = localStorage.getItem('token') || localStorage.getItem('authToken');
      const lsId = localStorage.getItem('id') || localStorage.getItem('userId');
      const parsedId = lsId ? Number(lsId) : undefined;

      if (token && (id !== null && typeof id !== "undefined")) {
        return;
      }

      if (lsToken) {
        dispatch(login({ id: parsedId, token: token || lsToken }));
        return;
      }
    } catch {
      // ignore localStorage errors
    }

    // No token found anywhere — redirect to login (cannot silently obtain token without credentials)
    navigate('/Login');
  }, [token, id, dispatch, navigate]);

  return null;
}

createRoot(document.getElementById('root')!).render(
      <Provider store={store}>
        <PersistGate loading={null} persistor={persistor}>
          <BrowserRouter>
            <NotificationsProvider slotProps={{
              snackbar: {
                anchorOrigin: { vertical: 'top', horizontal: 'right' },
              },
            }}>
                {/* StartupChecker runs after PersistGate rehydration and before routes mount */}
                <StartupChecker />

                <Routes>

                  <Route path='/' element={<RequireAuth><App /></RequireAuth> }>
                    <Route path="Main" element={<Main />} />

                    <Route path="Calculator" element={<Calculator />}>
                      <Route path="SelectCategory" element={<CalculatorCategories />}/>
                      <Route path="SelectTT" element={<CalculatorSelectTT />}/>
                      <Route path="Calculate/:Location" element={<Calculate />}/>
                    </Route>

                    <Route path="TT" element={<TT />}/>
                    <Route path="Users" element={<Users />} />
                    <Route path="/Users/Edit" element={<UserEdit />} />
                    <Route path="/Users/Edit/:id" element={<UserEdit />} />
                    <Route path="/Groups/Edit" element={<GroupEdit />} />
                    <Route path="/Groups/Edit/:id" element={<GroupEdit />} />
                    <Route path="/Roles/Edit" element={<RoleEdit />} />
                    <Route path="/Roles/Edit/:id" element={<RoleEdit />} />
                    <Route path="Settings" element={<Settings />} />
                    <Route path="Help" element={<Help />} /> 
                    <Route path="*" element={<NotFound />} />

                    <Route path='FactoryNX' element={<FactoryNX />} />
                    <Route path='Orders' element={<Orders />} />
                    <Route path='FactoryPerson' element={<FactoryPerson />} />
                    <Route path='/FactoryPerson/Edit' element={<FactoryPersonEdit />} />
                    <Route path='/FactoryPerson/Edit/:id' element={<FactoryPersonEdit />} />
                    <Route path='/Stock' element={<Stock />} />
                    <Route path='/Stock/:tab' element={<Stock />} />
                    <Route path='/StockTable' element={<StockTable />} />
                    <Route path='/Salary' element={<SalaryPage />} />
                    <Route path='/Salary/Settings' element={<SalarySettingsPage />} />
                    <Route path='Notifications' element={<Notifications />} />
                    
                  </Route>

                  <Route path='/Login' element={<Login />} />

                </Routes>

            </NotificationsProvider>
          </BrowserRouter>
        </PersistGate>
      </Provider>
)
