import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface PreferencesState {
  notificationSoundEnabled: boolean;
}

const initialState: PreferencesState = {
  notificationSoundEnabled: true,
};

const preferencesSlice = createSlice({
  name: "preferences",
  initialState,
  reducers: {
    setNotificationSoundEnabled(state, action: PayloadAction<boolean>) {
      state.notificationSoundEnabled = action.payload;
    },
  },
});

export const { setNotificationSoundEnabled } = preferencesSlice.actions;

export default preferencesSlice.reducer;
