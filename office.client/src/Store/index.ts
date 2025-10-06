import { configureStore } from '@reduxjs/toolkit';
import authReducer from './authSlice';
import notificationReducer from './notificationSlice';
import backButtonReducer from './stateForBackButtonSlice';
import pageTitleReducer from "./stateForPageTitleSlice"
import calculatorSlice from "./calculatorSlice"

const store = configureStore({
  reducer: {
    auth: authReducer,
    notification: notificationReducer,
    backButton: backButtonReducer,
    pageTitle: pageTitleReducer,
    calculatorData: calculatorSlice,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;
