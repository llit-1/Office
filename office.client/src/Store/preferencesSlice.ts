import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface PreferencesState {
  notificationSoundEnabled: boolean;
  sensorChartExpanded: boolean;
  sensorChartLineWidth: number;
  /** Тип заказа, выбранный последним в разделе «Заказы ТТ». */
  ordersTypeId: number | null;
}

const initialState: PreferencesState = {
  notificationSoundEnabled: true,
  sensorChartExpanded: false,
  sensorChartLineWidth: 2,
  ordersTypeId: null,
};

const preferencesSlice = createSlice({
  name: "preferences",
  initialState,
  reducers: {
    setNotificationSoundEnabled(state, action: PayloadAction<boolean>) {
      state.notificationSoundEnabled = action.payload;
    },
    setSensorChartExpanded(state, action: PayloadAction<boolean>) {
      state.sensorChartExpanded = action.payload;
    },
    setSensorChartLineWidth(state, action: PayloadAction<number>) {
      state.sensorChartLineWidth = Math.max(1, Math.min(3, action.payload));
    },
    setOrdersTypeId(state, action: PayloadAction<number | null>) {
      state.ordersTypeId = action.payload;
    },
  },
});

export const { setNotificationSoundEnabled, setSensorChartExpanded, setSensorChartLineWidth, setOrdersTypeId } = preferencesSlice.actions;

export default preferencesSlice.reducer;
