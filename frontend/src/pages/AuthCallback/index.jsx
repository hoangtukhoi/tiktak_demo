import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';

import Spinner from '../../components/common/Spinner';
import useAuthStore from '../../store/slices/authSlice';
import { getMe } from '../../api/auth.api';

/** Nhận token sau khi đăng nhập Google rồi chuyển về trang chủ. */
export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    const accessToken = params.get('accessToken');
    const refreshToken = params.get('refreshToken');

    if (!accessToken || !refreshToken) {
      toast.error('Đăng nhập thất bại');
      navigate('/login', { replace: true });
      return;
    }

    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);

    getMe()
      .then((user) => {
        setAuth(user, accessToken, refreshToken);
        navigate('/', { replace: true });
      })
      .catch(() => {
        toast.error('Không lấy được thông tin tài khoản');
        navigate('/login', { replace: true });
      });
  }, [params, navigate, setAuth]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <Spinner size="lg" />
    </div>
  );
}
