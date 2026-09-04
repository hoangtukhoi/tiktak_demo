import React, { useEffect } from 'react';
import AppRouter from './routes/AppRouter';
import useAuthStore from './store/slices/authSlice';
import { getMe } from './api/auth.api';
import { connectSocket, disconnectSocket } from './services/socket.service';

export default function App() {
  const { setAuth, clearAuth, isAuthenticated } = useAuthStore();

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        try {
          const user = await getMe();
          setAuth(user, token, localStorage.getItem('refreshToken'));
        } catch (error) {
          clearAuth();
        }
      }
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      connectSocket(localStorage.getItem('accessToken'));
    } else {
      disconnectSocket();
    }
    return () => disconnectSocket();
  }, [isAuthenticated]);

  return <AppRouter />;
}
