import { configureStore, combineReducers  } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import backButtonReducer from './stateForBackButtonSlice';
import pageTitleReducer from "./stateForPageTitleSlice"
import calculatorSlice from "./calculatorSlice"
import usersTabsReducer from './usersTabsSlice';
import userDataReducer from './userDataSlice';
import preferencesReducer from './preferencesSlice';
import { persistReducer, persistStore } from "redux-persist";
import storage from "redux-persist/lib/storage";
import {
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist";

const rootReducer = combineReducers({
  auth: authReducer,
  backButton: backButtonReducer,
  pageTitle: pageTitleReducer,
  usersTabs: usersTabsReducer,
  calculatorData: calculatorSlice,
  userData: userDataReducer,
  preferences: preferencesReducer,
});

const persistConfig = {
  key: "root",
  storage,
  whitelist: ["calculatorData", "pageTitle", "backButton", "auth", "usersTabs", "preferences", "userData"],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});


export const persistor = persistStore(store);
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
