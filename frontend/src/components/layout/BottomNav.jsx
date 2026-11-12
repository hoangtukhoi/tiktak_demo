import { NavLink } from 'react-router-dom';
import { Bell, Compass, Home, Plus, Shield, User } from 'lucide-react';
import useAuth from '../../hooks/useAuth';
import useNotificationStore from '../../store/slices/notificationSlice';

/** Thanh điều hướng dưới cùng (mobile). `dark`: dùng trên trang feed, nền đen như TikTok. */
export default function BottomNav({ dark = false }) {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const unread = useNotificationStore((s) => s.unreadCount);
  const items = [
    ['/', Home, 'Trang chủ'],
    ['/search', Compass, 'Khám phá'],
    ['/upload', Plus, null],
    ['/inbox', Bell, 'Hộp thư'],
    isAdmin ? ['/admin', Shield, 'Quản trị'] : [isAuthenticated ? `/profile/${user?.username}` : '/login', User, 'Hồ sơ'],
  ];
  const base = dark ? 'border-white/10 bg-black text-white' : 'border-line bg-bg text-fg';
  return (
    <nav className={`grid h-14 shrink-0 grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] lg:hidden ${base}`} style={{ boxSizing: 'content-box' }} aria-label="Điều hướng">
      {items.map(([to, Icon, label]) =>
        label ? (
          <NavLink key={label} to={to} end={to === '/'}
            className={({ isActive }) => `relative flex flex-col items-center justify-center gap-0.5 text-2xs font-medium ${isActive ? '' : 'opacity-60'}`}>
            {({ isActive }) => (
              <>
                <Icon size={23} strokeWidth={isActive ? 2.3 : 1.75} />
                {label}
                {to === '/inbox' && isAuthenticated && unread > 0 && <span className="absolute right-[30%] top-2 h-2 w-2 rounded-full bg-brand" />}
              </>
            )}
          </NavLink>
        ) : (
          <NavLink key="up" to={to} aria-label="Tải lên" className="flex items-center justify-center">
            <span className={`grid h-8 w-11 place-items-center rounded-md ${dark ? 'bg-white text-black' : 'bg-fg text-bg'}`}><Plus size={20} strokeWidth={2.5} /></span>
          </NavLink>
        )
      )}
    </nav>
  );
}
