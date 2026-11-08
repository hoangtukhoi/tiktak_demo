import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/slices/authSlice';

/**
 * role:    chỉ cho User.role này vào (vd 'admin')
 * notRole: chặn User.role này (vd admin không dùng trang Phân tích cá nhân) → chuyển về /admin
 */
export default function PrivateRoute({ children, role, notRole }) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user?.role !== role) return <Navigate to="/" replace />;
  if (notRole && user?.role === notRole) return <Navigate to={notRole === 'admin' ? '/admin' : '/'} replace />;
  return children;
}
