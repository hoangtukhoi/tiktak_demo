import { useEffect, useState } from 'react';
import { Search, Plus, Bell, LogOut } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import Avatar from '../common/Avatar';
import useAuthStore from '../../store/slices/authSlice';
import useNotificationStore from '../../store/slices/notificationSlice';
import useAuth from '../../hooks/useAuth';
import { getNotifications, markAllAsRead } from '../../api/notification.api';
import { timeAgo } from '../../utils/format';

export default function Header() {
  const [query, setQuery] = useState('');
  const [showPanel, setShowPanel] = useState(false);

  const { user, isAuthenticated } = useAuthStore();
  const { notifications, unreadCount, setNotifications, markAllRead } = useNotificationStore();
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isAuthenticated) return;
    getNotifications()
      .then((data) => setNotifications(data.items, data.unreadCount))
      .catch(() => {});
  }, [isAuthenticated, setNotifications]);

  const handleOpenPanel = async () => {
    setShowPanel(!showPanel);
    if (!showPanel && unreadCount > 0) {
      await markAllAsRead().catch(() => {});
      markAllRead();
    }
  };

  const submitSearch = (e) => {
    e.preventDefault();
    if (query.trim()) navigate(`/search?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <header className="fixed top-0 left-0 right-0 h-16 glass z-40 flex items-center justify-between px-4 lg:px-8">
      <Link to="/" className="text-2xl font-bold gradient-text tracking-tighter">
        TikTak
      </Link>

      <form onSubmit={submitSearch} className="hidden md:flex items-center flex-1 max-w-md mx-8 relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm kiếm video, người dùng, hashtag"
          className="w-full bg-white/10 border border-white/10 rounded-full py-2 pl-4 pr-10 focus:outline-none focus:border-brand-from transition-colors"
        />
        <button type="submit" aria-label="Tìm kiếm" className="absolute right-3">
          <Search className="w-5 h-5 text-gray-400" />
        </button>
      </form>

      <div className="flex items-center gap-4">
        {isAuthenticated ? (
          <>
            <Link
              to="/upload"
              className="hidden sm:flex items-center gap-2 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
              <span>Tải lên</span>
            </Link>

            <div className="relative">
              <button
                onClick={handleOpenPanel}
                aria-label="Thông báo"
                className="p-2 hover:bg-white/10 rounded-full relative"
              >
                <Bell className="w-6 h-6" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-[10px] flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showPanel && (
                <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto glass rounded-xl p-2 shadow-xl">
                  {notifications.length ? (
                    notifications.map((n) => (
                      <div key={n._id} className="p-3 rounded-lg hover:bg-white/5 text-sm">
                        <p>
                          <span className="font-semibold">{n.payload?.actorUsername || 'Hệ thống'}</span>{' '}
                          {n.payload?.message}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                    ))
                  ) : (
                    <p className="p-4 text-sm text-gray-400 text-center">Chưa có thông báo</p>
                  )}
                </div>
              )}
            </div>

            <Link to={`/profile/${user?.username}`}>
              <Avatar src={user?.avatarUrl} username={user?.username} size="sm" />
            </Link>

            <button onClick={logout} aria-label="Đăng xuất" className="p-2 hover:bg-white/10 rounded-full">
              <LogOut className="w-5 h-5" />
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="bg-brand-from hover:bg-brand-to px-4 py-2 rounded-lg font-medium transition-colors"
          >
            Đăng nhập
          </Link>
        )}
      </div>
    </header>
  );
}
