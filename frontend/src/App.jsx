import { useEffect } from 'react';
import AppRouter from './routes/AppRouter';
import useAuthStore from './store/slices/authSlice';
import useNotificationStore from './store/slices/notificationSlice';
import { getMe } from './api/auth.api';
import { getUnreadCount } from './api/notification.api';
import { connectSocket, disconnectSocket } from './services/socket.service';

export default function App() {
  const { setUser, clearAuth, isAuthenticated } = useAuthStore();

  // Xác thực lại phiên khi tải trang
  useEffect(() => {
    if (!localStorage.getItem('accessToken')) { if (isAuthenticated) clearAuth(); return; }
    getMe().then(setUser).catch(() => clearAuth());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Socket + số thông báo chưa đọc
  useEffect(() => {
    if (!isAuthenticated) return disconnectSocket();
    connectSocket(localStorage.getItem('accessToken'));
    getUnreadCount().then(useNotificationStore.getState().setUnreadCount).catch(() => {});
    return () => disconnectSocket();
  }, [isAuthenticated]);

  return <AppRouter />;
}
