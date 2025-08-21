import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface BackButtonState {
    path: string
    visible: boolean
}

const initialState : BackButtonState = {
    path: "/Main",
    visible: false
};

const stateForBackButtonSlice = createSlice({
    name: 'backButton',
    initialState,
    reducers: {
        pathSet: (state, action : PayloadAction<{path: string}>) => {
            state.path = action.payload.path;
        },
        visibleSet: (state, action : PayloadAction<{ visible: boolean }>) => {
        state.visible = action.payload.visible;
        },
    }
});

export const { pathSet, visibleSet } = stateForBackButtonSlice.actions;
export default stateForBackButtonSlice.reducer; 


