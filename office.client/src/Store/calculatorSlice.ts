import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface CalculatorState {
  /** Код точки (RKCode), с которой работали в калькуляторах последний раз. */
  ttCode: number | null;
}

const initialState: CalculatorState = {
  ttCode: null,
};

const calculatorSlice = createSlice({
  name: "calculatorData",
  initialState,
  reducers: {
    setCalculatorTt: (state, action: PayloadAction<number | null>) => {
      state.ttCode = action.payload;
    },
  },
});

export const { setCalculatorTt } = calculatorSlice.actions;
export default calculatorSlice.reducer;
