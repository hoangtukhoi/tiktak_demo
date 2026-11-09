import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { AtSign, Bell, Heart, Languages, MessageCircle, UserPlus } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import useAuth from '../../hooks/useAuth';
import useNotificationStore from '../../store/slices/notificationSlice';
import { getNotifications, markAllAsRead } from '../../api/notification.api';
import { timeAgo } from '../../utils/format';

// Lọc theo Notification.type (models/Notification.js)
const FILTERS = [
  ['all', 'Tất cả', null], ['like', 'Lượt thích', ['new_like']], ['comment', 'Bình luận', ['new_comment']],
  ['mention', 'Nhắc đến', ['mention']], ['follow', 'Người theo dõi', ['new_follower']], ['system', 'Hệ thống', ['video_ready', 'dubbing_done']],
];
const ICON = { new_like: [Heart, 'text-[#FF3B4E]'], new_comment: [MessageCircle, 'text-fg'], mention: [AtSign, 'text-fg'], new_follower: [UserPlus, 'text-brand-text'], video_ready: [Bell, 'text-success'], dubbing_done: [Languages, 'text-success'] };

const dayGroup = (d) => {
  const h = (Date.now() - new Date(d)) / 3600e3;
  return h < 24 ? 'Hôm nay' : h < 24 * 7 ? 'Tuần này' : 'Trước đó';
};

export default function Inbox() {
  const { isAuthenticated } = useAuth();
  const { notifications, unreadCount, setNotifications, markRead } = useNotificationStore();
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    getNotifications().then(async (n) => {
      setNotifications(n);
      if (n.some((x) => !x.isRead)) { await markAllAsRead().catch(() => {}); markRead(); }
    }).catch(() => {}).finally(() => setLoading(false));
  }, [isAuthenticated]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: '/inbox' }} />;

  const types = FILTERS.find(([k]) => k === filter)[2];
  const list = notifications.filter((n) => !types || types.includes(n.type));
  let lastGroup = null;

  return (
    <div className="mx-auto max-w-[680px] px-4 py-6 lg:py-10">
      <h1 className="hidden text-2xl font-bold lg:block">Hoạt động</h1>
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mt-5" role="tablist">
        {FILTERS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`chip shrink-0 ${filter === k ? 'chip-active' : ''}`}>{label}</button>
        ))}
      </div>
      <ul className="mt-4">
        {loading && !notifications.length ? [0, 1, 2, 3].map((i) => <li key={i} className="flex items-center gap-3 py-3"><span className="skeleton h-11 w-11 rounded-full" /><span className="skeleton h-4 flex-1 rounded" /></li>)
          : list.length ? list.map((n) => {
            const group = dayGroup(n.createdAt);
            const head = group !== lastGroup ? (lastGroup = group) : null;
            const [Icon, color] = ICON[n.type] || [Bell, 'text-fg'];
            return (
              <li key={n._id}>
                {head && <h2 className="pb-1 pt-4 text-sm font-semibold text-fg-muted">{head}</h2>}
                <Link to={n.videoId ? `/watch/${n.videoId}` : n.actor ? `/profile/${n.actor}` : '#'}
                  className="-mx-3 flex items-center gap-3 rounded px-3 py-2.5 hover:bg-surface-2">
                  <span className="relative">
                    {n.actor ? <Avatar user={{ username: n.actor, avatarUrl: n.payload?.actorAvatar }} size={44} />
                      : <span className="grid h-11 w-11 place-items-center rounded-full bg-surface-2"><Icon size={20} className={color} /></span>}
                    {n.actor && <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-surface ring-2 ring-surface"><Icon size={12} className={color} fill={n.type === 'new_like' ? 'currentColor' : 'none'} /></span>}
                  </span>
                  <p className="min-w-0 flex-1 text-base leading-snug">
                    {n.actor && <b className="font-semibold">{n.actor} </b>}{n.text}
                    <span className="block text-sm text-fg-muted">{timeAgo(n.createdAt)}</span>
                  </p>
                  {!n.isRead && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Chưa đọc" />}
                </Link>
              </li>
            );
          }) : (
            <li className="py-16 text-center text-fg-muted">
              <Bell size={32} strokeWidth={1.5} className="mx-auto" />
              <p className="mt-3 font-semibold text-fg">Chưa có hoạt động nào</p>
              <p className="text-sm">Lượt thích, bình luận và người theo dõi mới sẽ hiện ở đây.</p>
            </li>
          )}
      </ul>
      {unreadCount > 0 && <span className="sr-only">{unreadCount} thông báo chưa đọc</span>}
    </div>
  );
}
