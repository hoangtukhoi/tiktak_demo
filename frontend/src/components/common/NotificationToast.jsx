import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { AtSign, Bell, CheckCircle2, Heart, Languages, MessageCircle, Repeat2, ShieldAlert, UserPlus, X } from 'lucide-react';
import Avatar from './Avatar';

const ICON = {
  new_like: [Heart, 'bg-danger text-white'],
  new_comment: [MessageCircle, 'bg-brand text-white'],
  mention: [AtSign, 'bg-brand text-white'],
  new_follower: [UserPlus, 'bg-fg text-bg'],
  video_ready: [CheckCircle2, 'bg-brand text-white'],
  dubbing_done: [Languages, 'bg-brand text-white'],
  repost: [Repeat2, 'bg-brand text-white'],
  moderation: [ShieldAlert, 'bg-warn text-white'],
};

export const notificationLink = (n) => (n.videoId ? `/watch/${n.videoId}` : n.actor ? `/profile/${n.actor}` : null);

/** Thẻ thông báo trượt vào từ cạnh phải, vuốt sang phải để tắt, bấm để mở */
function NotificationCard({ t, n }) {
  const [Icon, tone] = ICON[n.type] || [Bell, 'bg-brand text-white'];
  const to = notificationLink(n);
  const close = () => toast.dismiss(t.id);
  const body = (
    <>
      <span className="relative shrink-0">
        {n.actor ? (
          <Avatar user={{ username: n.actor, avatarUrl: n.payload?.actorAvatar }} size={42} />
        ) : (
          <span className="grid h-[42px] w-[42px] place-items-center rounded-full bg-surface-3">{n.type === 'moderation' ? <ShieldAlert size={19} /> : <Bell size={19} />}</span>
        )}
        <span className={`absolute -bottom-1 -right-1 grid h-5 w-5 place-items-center rounded-full ring-2 ring-line ${tone}`}>
          <Icon size={11} strokeWidth={2.6} fill={n.type === 'new_like' ? 'currentColor' : 'none'} />
        </span>
      </span>
      <span className="min-w-0 flex-1 text-[14px] leading-snug">
        {n.actor && <b>@{n.actor} </b>}
        <span className="line-clamp-2 text-fg-muted [overflow-wrap:anywhere]">{n.text}</span>
      </span>
      {n.payload?.videoThumbnail && (
        <img src={n.payload.videoThumbnail} alt="" className="h-12 w-9 shrink-0 rounded-lg object-cover" onError={(e) => (e.currentTarget.style.display = 'none')} />
      )}
    </>
  );

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ x: '110%', opacity: 0 }}
      animate={t.visible ? { x: 0, opacity: 1 } : { x: '110%', opacity: 0 }}
      transition={{ type: 'spring', damping: 26, stiffness: 300 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.05, right: 0.8 }}
      onDragEnd={(_, i) => (i.offset.x > 80 || i.velocity.x > 500) && close()}
      className="pointer-events-auto relative w-[min(380px,calc(100vw-32px))] cursor-grab overflow-hidden rounded-3xl border border-line bg-surface/95 shadow-2xl shadow-black/60 backdrop-blur-xl active:cursor-grabbing"
    >
      {to ? (
        <Link to={to} onClick={close} draggable={false} className="flex items-center gap-3 p-3 pr-9">{body}</Link>
      ) : (
        <div className="flex items-center gap-3 p-3 pr-9">{body}</div>
      )}
      <button onClick={close} className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-fg-subtle transition hover:bg-surface-3 hover:text-fg" aria-label="Đóng thông báo">
        <X size={15} />
      </button>
      {/* thanh thời gian còn lại */}
      <motion.span
        className="absolute bottom-0 left-0 h-[3px] bg-brand"
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: (t.duration || 5000) / 1000, ease: 'linear' }}
      />
    </motion.div>
  );
}

/** Hiện thông báo trượt (gọi từ socket khi có thông báo mới) */
export function showNotificationToast(n) {
  toast.custom((t) => <NotificationCard t={t} n={n} />, {
    id: `notif-${n._id || Date.now()}`,
    duration: 5000,
    position: 'top-right',
  });
}
