import { useEffect, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, Bell, Compass, Home, Lock, LogOut, Moon, MoreHorizontal, Plus, Search, Shield, Sun, User, Users } from 'lucide-react';
import Logo from '../common/Logo';
import Avatar from '../common/Avatar';
import Menu from '../common/Menu';
import useAuth from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useMedia';
import useNotificationStore from '../../store/slices/notificationSlice';
import { getFollowing } from '../../api/auth.api';

function SearchBox() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');
  return (
    <form role="search" onSubmit={(e) => { e.preventDefault(); q.trim() && navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}>
      <label className="flex h-10 items-center gap-2 rounded bg-surface-2 px-3 text-fg-muted focus-within:ring-2 focus-within:ring-brand/30">
        <Search size={17} strokeWidth={1.75} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm kiếm" aria-label="Tìm kiếm"
          className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle" />
      </label>
    </form>
  );
}

function Item({ to, icon: Icon, label, badge, end }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => `flex h-11 items-center gap-3 rounded px-3 text-base font-semibold transition-colors ${isActive ? 'bg-surface-2 text-brand-text' : 'text-fg hover:bg-surface-2'}`}>
      {({ isActive }) => (
        <>
          <Icon size={22} strokeWidth={isActive ? 2.2 : 1.75} />
          <span className="flex-1">{label}</span>
          {badge > 0 && <span className="tabular min-w-[20px] rounded-full bg-brand px-1.5 text-center text-2xs font-bold leading-5 text-white">{badge > 99 ? '99+' : badge}</span>}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar() {
  const { user, isAuthenticated, isAdmin, isStaff, signOut } = useAuth();
  const unread = useNotificationStore((s) => s.unreadCount);
  const [theme, toggleTheme] = useTheme();
  const navigate = useNavigate();
  const [following, setFollowing] = useState([]);

  useEffect(() => {
    if (!user?._id) return setFollowing([]);
    getFollowing(user._id).then((l) => setFollowing(l.slice(0, 6))).catch(() => {});
  }, [user?._id]);

  return (
    <aside className="hidden w-[248px] shrink-0 flex-col border-r border-line bg-bg px-3 pb-3 pt-5 lg:flex">
      <div className="px-2"><Logo /></div>
      <div className="mt-5"><SearchBox /></div>

      <nav className="mt-4 flex flex-col gap-0.5" aria-label="Điều hướng chính">
        <Item to="/" end icon={Home} label="Dành cho bạn" />
        <Item to="/following" icon={Users} label="Đang theo dõi" />
        <Item to="/search" icon={Compass} label="Khám phá" />
        <Item to="/inbox" icon={Bell} label="Hoạt động" badge={isAuthenticated ? unread : 0} />
        <Item to="/upload" icon={Plus} label="Tải lên" />
        {/* Admin không có hồ sơ / phân tích cá nhân — dùng trang Quản trị */}
        {isAuthenticated && !isAdmin && <Item to="/analytics" icon={BarChart3} label="Phân tích" />}
        {isAuthenticated && !isAdmin && <Item to={`/profile/${user.username}`} icon={User} label="Hồ sơ" />}
        {isStaff && <Item to="/admin" icon={Shield} label={isAdmin ? 'Quản trị' : 'Kiểm duyệt'} />}
      </nav>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto border-t border-line pt-4">
        {isAuthenticated ? (
          following.length > 0 && (
            <>
              <p className="px-3 pb-2 text-xs font-semibold text-fg-muted">Tài khoản đang theo dõi</p>
              {following.map((u) => (
                <Link key={u._id} to={`/profile/${u.username}`} className="flex items-center gap-3 rounded px-3 py-1.5 hover:bg-surface-2">
                  <Avatar user={u} size={30} />
                  <span className="truncate text-sm font-semibold">{u.username}</span>
                </Link>
              ))}
            </>
          )
        ) : (
          <div className="px-3">
            <p className="text-sm text-fg-muted">Đăng nhập để theo dõi nhà sáng tạo, thích video và xem bình luận.</p>
            <Link to="/login" className="btn-outline mt-3 w-full border-brand text-brand-text hover:bg-brand-soft">Đăng nhập</Link>
          </div>
        )}
      </div>

      <div className="mt-2 border-t border-line pt-3">
        {isAuthenticated ? (
          <Menu up align="left" trigger={({ toggle }) => (
            <button onClick={toggle} className="flex w-full items-center gap-3 rounded px-2 py-1.5 text-left hover:bg-surface-2" aria-label="Tài khoản">
              <Avatar user={user} size={34} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{user.username}</span>
                <span className="block truncate text-xs text-fg-muted">{user.email}</span>
              </span>
              <MoreHorizontal size={18} className="text-fg-muted" />
            </button>
          )} items={[
            ...(isAdmin ? [] : [{ label: 'Quyền riêng tư', icon: Lock, onClick: () => navigate('/settings/privacy') }]),
            { label: theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối', icon: theme === 'dark' ? Sun : Moon, onClick: toggleTheme },
            { label: 'Đăng xuất', icon: LogOut, onClick: signOut, danger: true },
          ]} />
        ) : (
          <button onClick={toggleTheme} className="btn-ghost w-full justify-start px-3 text-fg-muted">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} {theme === 'dark' ? 'Giao diện sáng' : 'Giao diện tối'}
          </button>
        )}
      </div>
    </aside>
  );
}
