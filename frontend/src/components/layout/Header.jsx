import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Search } from 'lucide-react';
import Logo from '../common/Logo';
import useAuth from '../../hooks/useAuth';
import useNotificationStore from '../../store/slices/notificationSlice';

/** Thanh trên cùng cho mobile (< 1024px). Trên desktop, Sidebar đảm nhiệm điều hướng. */
export default function Header({ title, back = false }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const unread = useNotificationStore((s) => s.unreadCount);
  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line bg-bg px-2 pt-[env(safe-area-inset-top)] lg:hidden">
      {back ? (
        <button onClick={() => (history.length > 1 ? navigate(-1) : navigate('/'))} className="icon-btn" aria-label="Quay lại"><ArrowLeft size={22} /></button>
      ) : <span className="pl-2"><Logo className="!text-[22px]" /></span>}
      {title && <h1 className="ml-1 truncate text-md font-bold">{title}</h1>}
      <div className="ml-auto flex items-center">
        <Link to="/search" className="icon-btn" aria-label="Tìm kiếm"><Search size={21} strokeWidth={1.75} /></Link>
        {isAuthenticated ? (
          <Link to="/inbox" className="icon-btn relative" aria-label="Hoạt động">
            <Bell size={21} strokeWidth={1.75} />
            {unread > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-brand ring-2 ring-bg" />}
          </Link>
        ) : (
          <Link to="/login" className="btn-primary btn-sm ml-1">Đăng nhập</Link>
        )}
      </div>
    </header>
  );
}
