import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface PreferencesState {
  notificationSoundEnabled: boolean;
  sensorChartExpanded: boolean;
  sensorChartLineWidth: number;
}

const initialState: PreferencesState = {
  notificationSoundEnabled: true,
  sensorChartExpanded: false,
  sensorChartLineWidth: 2,
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
  },
});

export const { setNotificationSoundEnabled, setSensorChartExpanded, setSensorChartLineWidth } = preferencesSlice.actions;

export default preferencesSlice.reducer;
