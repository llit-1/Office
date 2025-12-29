import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  id: number | null;
  token: string | null;
  phone: string | null;
  code: string | null;
}

const initialState: AuthState = {
  id: null,
  token: null,
  phone: '',
  code: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login(state, action: PayloadAction<{ id?: number; token?: string; phone?: string; code?: string }>) {
      if (typeof action.payload.id !== 'undefined') {
        state.id = action.payload.id ?? null;
      }
      if (action.payload.token) {
        state.token = action.payload.token;
      }
      if (action.payload.phone) {
        state.phone = action.payload.phone;
      }
      if (action.payload.code) {
        state.code = action.payload.code;
      }
    },
    logout: (state) => {
      state.id = null;
      state.token = null;
      state.phone = '';
      state.code = null;
      try {
        localStorage.removeItem('authToken'); // legacy key
        localStorage.removeItem('token');
        localStorage.removeItem('id');
      } catch {}
    },
  },
});

export const { login, logout } = authSlice.actions;

export default authSlice.reducer;
