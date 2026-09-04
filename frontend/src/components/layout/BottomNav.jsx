import { Home, Search, PlusSquare, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import useAuthStore from '../../store/slices/authSlice';
export default function BottomNav() {
  const { user } = useAuthStore();
  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 h-14 glass z-40 flex items-center justify-around px-2 border-t border-white/10">
      <NavLink to="/" className={({isActive}) => `p-2 ${isActive ? 'text-brand-from' : 'text-gray-400'}`}><Home className="w-6 h-6" /></NavLink>
      <NavLink to="/search" className={({isActive}) => `p-2 ${isActive ? 'text-brand-from' : 'text-gray-400'}`}><Search className="w-6 h-6" /></NavLink>
      <NavLink to="/upload" className="p-2"><PlusSquare className="w-8 h-8 text-white" /></NavLink>
      <NavLink to={user ? `/profile/${user.username}` : '/login'} className={({isActive}) => `p-2 ${isActive ? 'text-brand-from' : 'text-gray-400'}`}><User className="w-6 h-6" /></NavLink>
    </nav>
  );
}
