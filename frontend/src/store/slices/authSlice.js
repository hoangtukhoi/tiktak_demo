import { create } from 'zustand';
import { persist } from 'zustand/middleware';
const useAuthStore = create(persist(
  (set) => ({
    user: null,
    isAuthenticated: false,
    setAuth: (user, accessToken, refreshToken) => {
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      set({ user, isAuthenticated: true });
    },
    setUser: (user) => set({ user }),
    clearAuth: () => {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({ user: null, isAuthenticated: false });
    },
  }),
  { name: 'auth', partialize: s => ({ user: s.user, isAuthenticated: s.isAuthenticated }) }
));
export default useAuthStore;
