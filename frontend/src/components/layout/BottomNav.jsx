import { NavLink } from 'react-router-dom';
import { Compass, Home, Plus, User, Users } from 'lucide-react';
import useAuth from '../../hooks/useAuth';

export default function BottomNav() {
  const { user, isAuthenticated } = useAuth();
  const items = [
    ['/', Home, 'Trang chủ'],
    ['/search', Compass, 'Khám phá'],
    ['/upload', Plus, ''],
    ['/following', Users, 'Theo dõi'],
    [isAuthenticated ? `/profile/${user?.username}` : '/login', User, 'Tôi'],
  ];
  return (
    <nav className="z-40 flex h-[58px] shrink-0 items-center justify-around border-t border-ink-600 bg-ink/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden" style={{ boxSizing: 'content-box' }}>
      {items.map(([to, Icon, label]) =>
        label ? (
          <NavLink key={label} to={to} end={to === '/'} className={({ isActive }) => `flex w-16 flex-col items-center gap-0.5 text-[11px] font-semibold transition ${isActive ? 'text-paper' : 'text-paper-mute'}`}>
            {({ isActive }) => (<><Icon size={23} strokeWidth={isActive ? 2.4 : 1.8} className={isActive ? 'text-lime' : ''} />{label}</>)}
          </NavLink>
        ) : (
          <NavLink key="up" to={to} aria-label="Tải lên" className="grid h-9 w-12 place-items-center rounded-xl bg-lime text-ink transition active:scale-90">
            <Plus size={22} strokeWidth={2.6} />
          </NavLink>
        )
      )}
    </nav>
  );
}
