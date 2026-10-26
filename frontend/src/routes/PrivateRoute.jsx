import { Navigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/slices/authSlice';

/** role: giới hạn theo User.role (vd 'admin') */
export default function PrivateRoute({ children, role }) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user?.role !== role) return <Navigate to="/" replace />;
  return children;
}
