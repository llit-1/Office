import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  token: string | null;
  phone: string | null;
  code: string | null;
}

const initialState: AuthState = {
  token: null,
  phone: '',
  code: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login(state, action: PayloadAction<{ token?: string; phone?: string; code?: string }>) {
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
      state.token = null;
      state.phone = '';
      state.code = null;
      localStorage.removeItem('authToken'); // Удаляем токен из localStorage
    },
  },
});

export const { login, logout } = authSlice.actions;

export default authSlice.reducer;
