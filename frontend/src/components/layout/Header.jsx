import { Search, Plus, Bell, Menu } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import Avatar from '../common/Avatar';
import useAuthStore from '../../store/slices/authSlice';
export default function Header() {
  const { user, isAuthenticated } = useAuthStore();
  const navigate = useNavigate();
  return (
    <header className="fixed top-0 left-0 right-0 h-16 glass z-40 flex items-center justify-between px-4 lg:px-8">
      <Link to="/" className="text-2xl font-bold gradient-text tracking-tighter">TikTak</Link>
      <div className="hidden md:flex items-center flex-1 max-w-md mx-8 relative">
        <input type="text" placeholder="Tìm kiếm..." className="w-full bg-white/10 border border-white/10 rounded-full py-2 pl-4 pr-10 focus:outline-none focus:border-brand-from transition-colors" onKeyDown={e => e.key === 'Enter' && navigate(`/search?q=${e.target.value}`)} />
        <Search className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
      </div>
      <div className="flex items-center gap-4">
        {isAuthenticated ? (
          <>
            <Link to="/upload" className="hidden sm:flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"><Plus className="w-5 h-5" /> <span>Tải lên</span></Link>
            <button className="p-2 hover:bg-white/10 rounded-full"><Bell className="w-6 h-6" /></button>
            <Link to={`/profile/${user?.username}`}><Avatar src={user?.avatar} username={user?.username} size="sm" /></Link>
          </>
        ) : (
          <Link to="/login" className="bg-brand-from hover:bg-brand-to px-4 py-2 rounded-lg font-medium transition-colors">Đăng nhập</Link>
        )}
      </div>
    </header>
  );
}
