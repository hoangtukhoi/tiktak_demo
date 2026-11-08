import { io } from 'socket.io-client';
import useNotificationStore from '../store/slices/notificationSlice';
import { getUnreadCount, normalizeNotification } from '../api/notification.api';
import { USE_MOCK } from '../api/axiosClient';
import { showNotificationToast } from '../components/common/NotificationToast';

let socket;
let authRetries = 0;

/**
 * sockets/notification.socket.js: handshake.auth.token, room user:<id>, event 'new_notification'
 *
 * Access token chỉ sống 15 phút. Server kiểm tra token lúc bắt tay, nên:
 * - `auth` là hàm → mỗi lần kết nối lại luôn lấy token MỚI NHẤT trong localStorage
 * - token hết hạn ("Invalid token") → Socket.IO KHÔNG tự thử lại, nên gọi 1 API để
 *   axios tự làm mới token (interceptor 401 → /auth/refresh) rồi kết nối lại.
 */
export const connectSocket = () => {
  if (USE_MOCK || socket || !localStorage.getItem('accessToken')) return;
  socket = io(import.meta.env.VITE_SOCKET_URL || undefined, {
    auth: (cb) => cb({ token: localStorage.getItem('accessToken') }),
    transports: ['websocket'],
  });

  socket.on('connect', () => { authRetries = 0; });

  socket.on('new_notification', (data) => {
    const n = normalizeNotification(data);
    useNotificationStore.getState().addNotification(n);
    showNotificationToast(n);
  });

  socket.on('connect_error', async (e) => {
    console.warn('[socket]', e.message);
    if (!/token|unauthorized/i.test(e.message) || !socket) return; // lỗi mạng: thư viện tự thử lại
    if (authRetries >= 3) return; // refresh token cũng hết hạn → axios sẽ chuyển về trang đăng nhập
    authRetries += 1;
    try {
      const count = await getUnreadCount(); // 401 → axios làm mới token
      useNotificationStore.getState().setUnreadCount(count);
    } catch { /* bỏ qua */ }
    setTimeout(() => socket?.connect(), 1000 * authRetries);
  });
};

export const disconnectSocket = () => { socket?.disconnect(); socket = null; authRetries = 0; };
export const getSocket = () => socket;
