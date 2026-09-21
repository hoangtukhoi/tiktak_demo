import { Home, Search, PlusSquare, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import useAuthStore from '../../store/slices/authSlice';

const linkClass = ({ isActive }) => `p-2 ${isActive ? 'text-brand-from' : 'text-gray-400'}`;

export default function BottomNav() {
  const user = useAuthStore((s) => s.user);

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 h-14 glass z-40 flex items-center justify-around px-2 border-t border-white/10">
      <NavLink to="/" end className={linkClass} aria-label="Trang chủ">
        <Home className="w-6 h-6" />
      </NavLink>
      <NavLink to="/search" className={linkClass} aria-label="Tìm kiếm">
        <Search className="w-6 h-6" />
      </NavLink>
      <NavLink to="/upload" className="p-2" aria-label="Tải lên">
        <PlusSquare className="w-8 h-8 text-white" />
      </NavLink>
      <NavLink
        to={user ? `/profile/${user.username}` : '/login'}
        className={linkClass}
        aria-label="Hồ sơ"
      >
        <User className="w-6 h-6" />
      </NavLink>
    </nav>
  );
}
