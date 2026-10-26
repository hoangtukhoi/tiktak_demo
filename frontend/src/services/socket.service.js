import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import useNotificationStore from '../store/slices/notificationSlice';
import { normalizeNotification } from '../api/notification.api';
import { USE_MOCK } from '../api/axiosClient';

let socket;

/** sockets/notification.socket.js: handshake.auth.token, room user:<id>, event 'new_notification' */
export const connectSocket = (token) => {
  if (USE_MOCK || !token || socket?.connected) return;
  socket = io(import.meta.env.VITE_SOCKET_URL || undefined, { auth: { token }, transports: ['websocket'] });
  socket.on('new_notification', (data) => {
    const n = normalizeNotification(data);
    useNotificationStore.getState().addNotification(n);
    toast(n.actor ? `@${n.actor} ${n.text}` : n.text, { icon: '🔔' });
  });
  socket.on('connect_error', (e) => console.warn('[socket]', e.message));
};

export const disconnectSocket = () => { socket?.disconnect(); socket = null; };
export const getSocket = () => socket;
