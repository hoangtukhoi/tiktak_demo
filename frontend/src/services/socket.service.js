import { io } from 'socket.io-client';
import useNotificationStore from '../store/slices/notificationSlice';
import useVideoStore from '../store/slices/videoSlice';
import { SOCKET_EVENTS } from '../utils/constants';

let socket = null;

const socketUrl = () => {
  const base = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || '';
  return base.replace(/\/api\/?$/, '') || window.location.origin;
};

export const connectSocket = (token) => {
  if (!token || socket?.connected) return socket;

  socket = io(socketUrl(), {
    auth: { token },
    transports: ['websocket'],
    reconnectionAttempts: 5,
  });

  socket.on(SOCKET_EVENTS.NOTIFICATION, (data) => {
    useNotificationStore.getState().addNotification(data);
  });

  // Tiến trình transcode và lồng tiếng dùng chung store để component đọc theo videoId.
  socket.on(SOCKET_EVENTS.TRANSCODE_PROGRESS, (data) => {
    useVideoStore.getState().setProcessingState(data.videoId, data);
  });

  socket.on(SOCKET_EVENTS.DUBBING_PROGRESS, (data) => {
    useVideoStore.getState().setDubbingState(data.videoId, data);
  });

  return socket;
};

export const disconnectSocket = () => {
  socket?.disconnect();
  socket = null;
};

export const getSocket = () => socket;

/** Đăng ký nhận tiến trình của một video cụ thể khi đang mở trang xem. */
export const watchVideo = (videoId) => socket?.emit('video:subscribe', videoId);
export const unwatchVideo = (videoId) => socket?.emit('video:unsubscribe', videoId);
