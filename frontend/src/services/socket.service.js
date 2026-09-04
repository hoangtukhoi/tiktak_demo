import { io } from 'socket.io-client';
import useNotificationStore from '../store/slices/notificationSlice';

let socket;
export const connectSocket = (token) => {
  if (socket?.connected) return;
  socket = io(import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000', {
    auth: { token },
    transports: ['websocket'],
  });
  socket.on('connect', () => console.log('Socket connected'));
  socket.on('disconnect', () => console.log('Socket disconnected'));
  socket.on('notification', (data) => {
    useNotificationStore.getState().addNotification(data);
  });
};
export const disconnectSocket = () => { socket?.disconnect(); socket = null; };
export const getSocket = () => socket;
