import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface pageTitleState {
    title: string
}

const initialState : pageTitleState = {
    title: "Главная"
};

const stateForPageTitleSlice = createSlice({
    name: 'pageTitle',
    initialState,
    reducers: {
        titleSet: (state, action : PayloadAction<{title: string}>) => {
            state.title = action.payload.title;
        },
    }
});

export const { titleSet } = stateForPageTitleSlice.actions;
export default stateForPageTitleSlice.reducer; 


