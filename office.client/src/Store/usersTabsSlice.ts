import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UsersTabsState {
  activeIndex: number;
}

const initialState: UsersTabsState = {
  activeIndex: 0,
};

const usersTabsSlice = createSlice({
  name: 'usersTabs',
  initialState,
  reducers: {
    activeIndexSet: (state, action: PayloadAction<{ activeIndex: number }>) => {
      state.activeIndex = action.payload.activeIndex;
    },
  },
});

export const { activeIndexSet } = usersTabsSlice.actions;
export default usersTabsSlice.reducer;
