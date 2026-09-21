import { useEffect } from 'react';

import AppRouter from './routes/AppRouter';
import useAuthStore from './store/slices/authSlice';
import { getMe } from './api/auth.api';
import { connectSocket, disconnectSocket } from './services/socket.service';

export default function App() {
  const { setAuth, clearAuth, isAuthenticated } = useAuthStore();

  // Khôi phục phiên đăng nhập khi mở lại ứng dụng.
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    getMe()
      .then((user) => setAuth(user, token, localStorage.getItem('refreshToken')))
      .catch(() => clearAuth());
  }, [setAuth, clearAuth]);

  useEffect(() => {
    if (isAuthenticated) connectSocket(localStorage.getItem('accessToken'));
    else disconnectSocket();
    return () => disconnectSocket();
  }, [isAuthenticated]);

  return <AppRouter />;
}
