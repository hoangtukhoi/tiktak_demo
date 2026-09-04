import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import useAuthStore from '../store/slices/authSlice';
import * as authApi from '../api/auth.api';

export default function useAuth() {
  const { user, isAuthenticated, setAuth, clearAuth } = useAuthStore();
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const login = async (email, password) => {
    setIsLoading(true);
    try {
      const data = await authApi.login(email, password);
      setAuth(data.user, data.accessToken, data.refreshToken);
      toast.success('Đăng nhập thành công!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Đăng nhập thất bại');
    } finally { setIsLoading(false); }
  };

  const register = async (username, email, password) => {
    setIsLoading(true);
    try {
      const data = await authApi.register(username, email, password);
      setAuth(data.user, data.accessToken, data.refreshToken);
      toast.success('Đăng ký thành công!');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Đăng ký thất bại');
    } finally { setIsLoading(false); }
  };

  const logout = async () => {
    try {
      await authApi.logout(localStorage.getItem('refreshToken'));
    } finally {
      clearAuth();
      navigate('/login');
    }
  };

  return { user, isAuthenticated, isLoading, login, register, logout };
}
