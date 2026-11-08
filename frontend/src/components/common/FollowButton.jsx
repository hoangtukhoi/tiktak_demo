import { useState } from 'react';
import toast from 'react-hot-toast';
import useAuth from '../../hooks/useAuth';
import { toggleFollow } from '../../api/user.api';
import { errMsg } from '../../api/axiosClient';

/**
 * Nút Theo dõi / Đang theo dõi / Theo dõi lại / Bạn bè.
 * onChange(isFollowing) được gọi sau khi server xác nhận.
 */
export default function FollowButton({ user, isFollowing, followsYou, onChange, size = 'md', className = '' }) {
  const { requireAuth } = useAuth();
  const [busy, setBusy] = useState(false);
  const [hover, setHover] = useState(false);

  const click = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!requireAuth('Đăng nhập để theo dõi')) return;
    setBusy(true);
    try {
      const r = await toggleFollow(user.username);
      onChange?.(Boolean(r?.following));
    } catch (err) {
      toast.error(errMsg(err));
    }
    setBusy(false);
  };

  const label = isFollowing
    ? hover ? 'Bỏ theo dõi' : followsYou ? 'Bạn bè' : 'Đang theo dõi'
    : followsYou ? 'Theo dõi lại' : 'Theo dõi';
  const pad = size === 'sm' ? '!px-4 !py-1.5 text-sm' : '';
  return (
    <button
      onClick={click}
      disabled={busy}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`${isFollowing ? 'btn-ghost hover:!text-coral' : 'btn'} min-w-[112px] ${pad} ${className}`}
      aria-pressed={isFollowing}
    >
      {label}
    </button>
  );
}
