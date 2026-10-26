import { NavLink, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Compass, Home, Plus, Shield, User, Users } from 'lucide-react';
import useAuth from '../../hooks/useAuth';

const GREETINGS = ['Xin chào', 'Hello', 'こんにちは', '안녕하세요', '你好', 'Bonjour', 'Hallo', 'Hola', 'สวัสดี', 'Halo'];

export default function Sidebar() {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const items = [
    ['/', Home, 'Dành cho bạn'],
    ['/following', Users, 'Đang theo dõi'],
    ['/search', Compass, 'Khám phá'],
    ['/upload', Plus, 'Tải lên'],
    isAuthenticated && [`/profile/${user?.username}`, User, 'Hồ sơ'],
    isAdmin && ['/admin', Shield, 'Quản trị'],
  ].filter(Boolean);

  return (
    <aside className="hidden w-[244px] shrink-0 flex-col border-r border-ink-600 px-3 py-4 lg:flex">
      <nav className="flex flex-col gap-1">
        {items.map(([to, Icon, label]) => (
          <NavLink key={to} to={to} end={to === '/'} className="group relative">
            {({ isActive }) => (
              <span className={`relative flex items-center gap-3.5 rounded-2xl px-4 py-3 font-bold transition duration-300 ${isActive ? 'text-paper' : 'text-paper-dim hover:translate-x-1 hover:text-paper'}`}>
                {isActive && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-2xl bg-ink-700" transition={{ type: 'spring', damping: 30, stiffness: 380 }} />}
                <Icon size={22} className={`relative ${isActive ? 'text-lime' : ''}`} strokeWidth={isActive ? 2.4 : 1.9} />
                <span className="relative">{label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {!isAuthenticated && (
        <div className="mt-6 rounded-3xl border border-ink-600 p-4">
          <p className="text-sm leading-relaxed text-paper-dim">Đăng nhập để thả tim, bình luận và nghe video bằng ngôn ngữ của bạn.</p>
          <Link to="/login" className="btn mt-3 w-full">Đăng nhập</Link>
        </div>
      )}

      <div className="mt-auto overflow-hidden rounded-3xl bg-lime p-4 text-ink">
        <p className="label !text-ink/60">AI lồng tiếng</p>
        <p className="mt-1 text-xl font-extrabold leading-tight tracking-tight">Xem bằng 10 ngôn ngữ</p>
        <div className="mt-3 flex w-max animate-marquee gap-4 whitespace-nowrap font-mono text-xs font-bold">
          {[...GREETINGS, ...GREETINGS].map((g, i) => <span key={i}>{g} ·</span>)}
        </div>
      </div>
      <p className="mt-3 px-2 font-mono text-[10px] text-paper-mute">© {new Date().getFullYear()} TikTak · PTIT</p>
    </aside>
  );
}
