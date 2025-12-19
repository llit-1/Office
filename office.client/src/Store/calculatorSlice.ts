import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface CalculateState {
  idCategory: number | null;
  idTT: string | null;
  categoryName: string | null;
}

const initialState: CalculateState = {
  idCategory: 1,
  idTT: "",
  categoryName: "",
};

const calculateSlice = createSlice({
  name: "calculatorData",
  initialState,
  reducers: {
    // частичное обновление только тех полей, которые пришли
    setCalculatorData: (state, action: PayloadAction<Partial<CalculateState>>) => {
      const { idCategory, idTT, categoryName } = action.payload;

      if (idCategory !== undefined) {
        state.idCategory = idCategory; // позволит записать и число, и null
      }
      if (idTT !== undefined) {
        state.idTT = idTT; // позволит записать и число, и null
      }
      if (categoryName !== undefined) {
        state.categoryName = categoryName;
      }
    },

    // опционально: отдельные точечные экшены
    setIdTT: (state, action: PayloadAction<string | null>) => {
      state.idTT = action.payload;
    },
    setIdCategory: (state, action: PayloadAction<number | null>) => {
      state.idCategory = action.payload;
    },
    setCategoryName: (state, action: PayloadAction<string>) => {
      state.categoryName = action.payload;
    }
  },
});

export const { setCalculatorData, setIdTT, setIdCategory, setCategoryName } = calculateSlice.actions;
export default calculateSlice.reducer;
