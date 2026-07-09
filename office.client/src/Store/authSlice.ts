import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  id: number | null;
  token: string | null;
  fullName: string | null;
  position: string | null;
  initialized: boolean;
}

const initialState: AuthState = {
  id: null,
  token: null,
  fullName: null,
  position: null,
  initialized: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login(state, action: PayloadAction<{ id?: number; token?: string; fullName?: string | null; position?: string | null }>) {
      if (typeof action.payload.id !== 'undefined') {
        state.id = action.payload.id ?? null;
      }
      if (typeof action.payload.token !== 'undefined') {
        state.token = action.payload.token ?? null;
      }
      if (typeof action.payload.fullName !== 'undefined') {
        state.fullName = action.payload.fullName ?? null;
      }
      if (typeof action.payload.position !== 'undefined') {
        state.position = action.payload.position ?? null;
      }
      state.initialized = true;
    },
    logout: (state) => {
      state.id = null;
      state.token = null;
      state.fullName = null;
      state.position = null;
      state.initialized = true;
      try {
        localStorage.removeItem('authToken'); // legacy key
        localStorage.removeItem('token');
        localStorage.removeItem('id');
        localStorage.removeItem('login');
        localStorage.removeItem('userFullName');
        localStorage.removeItem('userPosition');
      } catch {}
    },
    setAuthInitialized(state, action: PayloadAction<boolean>) {
      state.initialized = action.payload;
    },
  },
});

export const { login, logout, setAuthInitialized } = authSlice.actions;

export default authSlice.reducer;
