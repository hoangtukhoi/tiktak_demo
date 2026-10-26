import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, LogOut, Plus, Search, Shield, User } from 'lucide-react';
import Avatar from '../common/Avatar';
import Spinner from '../common/Spinner';
import useAuth from '../../hooks/useAuth';
import useNotificationStore from '../../store/slices/notificationSlice';
import { getNotifications, markAllAsRead } from '../../api/notification.api';
import { timeAgo } from '../../utils/format';

export function Logo({ className = '' }) {
  return (
    <Link to="/" className={`group flex items-center gap-2 text-[26px] font-extrabold tracking-tightest ${className}`} aria-label="TikTak — Trang chủ">
      <span className="relative h-6 w-6 rounded-full bg-lime transition-transform duration-500 ease-spring group-hover:rotate-180">
        <span className="absolute left-[5px] top-[9px] h-1.5 w-1.5 animate-tick rounded-full bg-ink" />
      </span>
      tiktak
    </Link>
  );
}

function useClickOutside(ref, onOut) {
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && onOut();
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [ref, onOut]);
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { notifications, unreadCount, setNotifications, markRead } = useNotificationStore();
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setLoading(true);
    try {
      setNotifications(await getNotifications());
      if (unreadCount) { await markAllAsRead(); markRead(); }
    } catch { /* hiển thị danh sách cũ */ }
    setLoading(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle} className="relative grid h-10 w-10 place-items-center rounded-full transition hover:bg-ink-700" aria-label="Thông báo">
        <Bell size={21} />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
              className="absolute right-0.5 top-0.5 min-w-[18px] rounded-full bg-lime px-1 font-mono text-[10px] font-bold leading-[18px] text-ink"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.2 }}
            className="fixed right-3 top-[64px] z-50 w-[min(360px,calc(100vw-24px))] origin-top-right overflow-hidden rounded-3xl border border-ink-600 bg-ink-800 shadow-2xl shadow-black/50 sm:absolute sm:right-0 sm:top-12"
          >
            <div className="flex items-baseline justify-between px-5 pb-2 pt-4">
              <h3 className="text-lg font-extrabold">Thông báo</h3>
              <span className="label">{notifications.length} mục</span>
            </div>
            <div className="max-h-[60dvh] overflow-y-auto px-2 pb-2">
              {loading && !notifications.length ? (
                <div className="grid place-items-center py-10 text-paper-dim"><Spinner /></div>
              ) : notifications.length ? (
                notifications.map((n) => (
                  <Link
                    key={n._id}
                    to={n.videoId ? `/watch/${n.videoId}` : n.actor ? `/profile/${n.actor}` : '#'}
                    onClick={() => setOpen(false)}
                    className={`flex items-start gap-3 rounded-2xl px-3 py-3 transition hover:bg-ink-700 ${n.isRead ? '' : 'bg-ink-700/60'}`}
                  >
                    {n.actor ? <Avatar user={{ username: n.actor, avatarUrl: n.payload?.actorAvatar }} size={36} /> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-lime text-ink"><Bell size={17} /></span>}
                    <p className="flex-1 text-sm leading-snug">
                      {n.actor && <b>@{n.actor} </b>}{n.text}
                      <span className="mt-0.5 block font-mono text-[11px] text-paper-mute">{timeAgo(n.createdAt)}</span>
                    </p>
                    {!n.isRead && <span className="mt-2 h-2 w-2 rounded-full bg-lime" />}
                  </Link>
                ))
              ) : (
                <p className="px-4 py-10 text-center text-sm text-paper-dim">Chưa có gì mới. Khi ai đó thích hay bình luận, bạn sẽ thấy ở đây.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const { user, isAdmin, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useClickOutside(ref, () => setOpen(false));
  const item = 'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition hover:bg-ink-700';
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="rounded-full transition hover:scale-105" aria-label="Tài khoản">
        <Avatar user={user} size={36} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}
            className="absolute right-0 top-12 z-50 w-56 rounded-2xl border border-ink-600 bg-ink-800 p-1.5 shadow-2xl shadow-black/50"
            onClick={() => setOpen(false)}
          >
            <div className="px-3 pb-2 pt-1.5">
              <p className="truncate font-bold">@{user?.username}</p>
              <p className="truncate text-xs text-paper-mute">{user?.email}</p>
            </div>
            <Link to={`/profile/${user?.username}`} className={item}><User size={17} /> Hồ sơ</Link>
            {isAdmin && <Link to="/admin" className={item}><Shield size={17} /> Quản trị</Link>}
            <button onClick={signOut} className={`${item} w-full text-coral`}><LogOut size={17} /> Đăng xuất</button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Header() {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [q, setQ] = useState(params.get('q') || '');

  const submit = (e) => {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <header className="relative z-40 flex h-[60px] shrink-0 items-center gap-3 border-b border-ink-600 bg-ink/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:px-6">
      <Logo />
      <form onSubmit={submit} className="mx-auto hidden w-full max-w-[460px] md:block" role="search">
        <label className="group flex items-center gap-2 rounded-full border border-ink-500 bg-ink-800 px-4 transition focus-within:border-lime focus-within:ring-4 focus-within:ring-lime/15">
          <Search size={18} className="text-paper-mute transition group-focus-within:text-lime" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm video, #hashtag, người dùng"
            className="h-10 w-full bg-transparent text-[15px] outline-none placeholder:text-paper-mute"
          />
          <kbd className="hidden font-mono text-[11px] text-paper-mute lg:block">↵</kbd>
        </label>
      </form>
      <div className="ml-auto flex items-center gap-1.5 md:ml-0">
        <Link to="/search" className="grid h-10 w-10 place-items-center rounded-full hover:bg-ink-700 md:hidden" aria-label="Tìm kiếm"><Search size={21} /></Link>
        {isAuthenticated ? (
          <>
            <Link to="/upload" className="btn-ghost hidden !py-2 sm:inline-flex"><Plus size={18} /> Tải lên</Link>
            <Notifications />
            <UserMenu />
          </>
        ) : (
          <Link to="/login" className="btn !py-2">Đăng nhập</Link>
        )}
      </div>
    </header>
  );
}
