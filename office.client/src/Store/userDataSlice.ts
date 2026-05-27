import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { UserDataResponse } from "../Interfaces/UserData";

interface UserDataState {
  newNotifications: UserDataResponse["newNotifications"];
  activeNotifications: UserDataResponse["activeNotifications"];
  roles: string[];
  loaded: boolean;
}

const initialState: UserDataState = {
  newNotifications: [],
  activeNotifications: [],
  roles: [],
  loaded: false,
};

const userDataSlice = createSlice({
  name: "userData",
  initialState,
  reducers: {
    setUserData(state, action: PayloadAction<UserDataResponse>) {
      state.newNotifications = action.payload.newNotifications ?? [];
      state.activeNotifications = action.payload.activeNotifications ?? [];
      state.roles = action.payload.roles ?? [];
      state.loaded = true;
    },
    clearUserData(state) {
      state.newNotifications = [];
      state.activeNotifications = [];
      state.roles = [];
      state.loaded = false;
    },
  },
});

export const { setUserData, clearUserData } = userDataSlice.actions;

export default userDataSlice.reducer;
