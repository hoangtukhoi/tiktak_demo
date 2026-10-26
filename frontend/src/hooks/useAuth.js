import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/slices/authSlice';
import useNotificationStore from '../store/slices/notificationSlice';
import * as authApi from '../api/auth.api';

export default function useAuth() {
  const { user, isAuthenticated, setAuth, clearAuth, setUser } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const signIn = async (email, password) => {
    const r = await authApi.login(email, password);
    setAuth(r.user, r.accessToken, r.refreshToken);
    return r.user;
  };

  const signUp = async (username, email, password) => {
    const r = await authApi.register(username, email, password);
    setAuth(r.user, r.accessToken, r.refreshToken);
    return r.user;
  };

  const signOut = async () => {
    try { await authApi.logout(localStorage.getItem('refreshToken')); } catch { /* token có thể đã hết hạn */ }
    clearAuth();
    useNotificationStore.getState().reset();
    navigate('/login');
  };

  /** Dùng trước các hành động cần đăng nhập (like, comment, dịch...) */
  const requireAuth = (msg = 'Đăng nhập để tiếp tục') => {
    if (isAuthenticated) return true;
    toast(msg);
    navigate('/login', { state: { from: location.pathname } });
    return false;
  };

  return { user, isAuthenticated, isAdmin: user?.role === 'admin', signIn, signUp, signOut, requireAuth, setUser };
}
