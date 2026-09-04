import { Home, Compass, Users, Plus, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import useAuthStore from '../../store/slices/authSlice';
import Avatar from '../common/Avatar';
export default function Sidebar() {
  const { user, isAuthenticated } = useAuthStore();
  const links = [
    { to: '/', icon: Home, label: 'Trang chủ' },
    { to: '/search', icon: Compass, label: 'Khám phá' },
    { to: '/following', icon: Users, label: 'Đang theo dõi' },
  ];
  return (
    <aside className="hidden lg:flex flex-col w-64 h-[calc(100vh-4rem)] fixed top-16 left-0 border-r border-white/10 p-4 overflow-y-auto">
      <nav className="flex flex-col gap-2">
        {links.map(l => (
          <NavLink key={l.to} to={l.to} className={({isActive}) => `flex items-center gap-3 p-3 rounded-lg transition-colors ${isActive ? 'bg-white/10 font-bold' : 'hover:bg-white/5'}`}>
            <l.icon className="w-6 h-6" /> <span className="text-lg">{l.label}</span>
          </NavLink>
        ))}
      </nav>
      {isAuthenticated && (
        <div className="mt-auto pt-4 border-t border-white/10 flex items-center gap-3 p-2">
          <Avatar src={user?.avatar} username={user?.username} size="md" />
          <div className="flex flex-col overflow-hidden">
            <span className="font-semibold truncate">{user?.username}</span>
            <span className="text-sm text-gray-400 truncate">{user?.email}</span>
          </div>
        </div>
      )}
    </aside>
  );
}
