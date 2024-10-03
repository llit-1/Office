import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface NotificationSate {
    isOpen: boolean;
    isGood: boolean;
    message: string;
}

const initialState : NotificationSate = {
    isOpen: false,
    isGood: true,
    message: ""
};

const notificationSlice = createSlice({
    name: 'notification',
    initialState,
    reducers: {
        showNotification: (state, action : PayloadAction<{isGood: boolean, message: string}>) => {
            state.isOpen = true;
            state.isGood = action.payload.isGood;
            state.message = action.payload.message;
        },
        hideNotification: (state) => {
            state.isOpen = false;
            state.message = "";
        }
    }
});

export const {showNotification, hideNotification} = notificationSlice.actions;
export default notificationSlice.reducer; 


