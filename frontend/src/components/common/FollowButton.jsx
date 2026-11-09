import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import useAuth from '../../hooks/useAuth';
import { followUser, unfollowUser } from '../../api/auth.api';
import { errMsg } from '../../api/axiosClient';

/** Nút Theo dõi dùng chung (feed, hồ sơ, danh sách follower, tìm kiếm). Ẩn với chính mình. */
export default function FollowButton({ user, size, onChange, className = '' }) {
  const { user: me, requireAuth } = useAuth();
  const [following, setFollowing] = useState(!!user?.isFollowing);
  const [busy, setBusy] = useState(false);
  useEffect(() => setFollowing(!!user?.isFollowing), [user?._id, user?.isFollowing]);

  if (!user?._id || me?._id === user._id) return null;

  const toggle = async (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!requireAuth('Đăng nhập để theo dõi')) return;
    const next = !following;
    setFollowing(next); setBusy(true);
    try {
      const r = await (next ? followUser(user._id) : unfollowUser(user._id));
      onChange?.({ isFollowing: next, followerCount: r?.followerCount });
    } catch (err) {
      setFollowing(!next);
      toast.error(errMsg(err));
    }
    setBusy(false);
  };

  return (
    <button onClick={toggle} disabled={busy} aria-pressed={following}
      className={`${following ? 'btn-secondary' : 'btn-primary'} ${size === 'sm' ? 'btn-sm' : ''} min-w-[96px] ${className}`}>
      {following ? 'Đang theo dõi' : 'Theo dõi'}
    </button>
  );
}
