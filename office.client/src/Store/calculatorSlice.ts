import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface calculateState {
    idCategory: number | null,
    idTT: number | null,
}

const initialState : calculateState = {
    idCategory: 1,
    idTT: 1
};

const calculateSlice = createSlice({
    name: 'calculatorData',
    initialState,
    reducers: {
        setCalculatorData: (state, action : PayloadAction<{idCategory?: number | null, idTT?: number| null}>) => {
            
            if(action.payload.idCategory)
            {
                state.idCategory = action.payload.idCategory;
            }

            if(action.payload.idTT)
            {
                state.idTT = action.payload.idTT;
            }
        },
    }
});

export const { setCalculatorData } = calculateSlice.actions;
export default calculateSlice.reducer; 


