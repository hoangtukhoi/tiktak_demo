import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { BadgeCheck, Lock, Search, UserMinus } from 'lucide-react';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import FollowButton from '../common/FollowButton';
import { getFollowersPage as getFollowers, getFollowingPage as getFollowing, isPrivateError, removeFollower } from '../../api/user.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount } from '../../utils/format';

const TABS = [['followers', 'Người theo dõi'], ['following', 'Đang theo dõi']];

/**
 * Bảng danh sách Người theo dõi / Đang theo dõi của 1 hồ sơ.
 * profile: { username, followerCount, followingCount, access }; isMe: đang xem hồ sơ của chính mình
 */
export default function FollowListSheet({ profile, isMe, open, tab, onTab, onClose, onCountChange }) {
  const [q, setQ] = useState('');
  const [state, setState] = useState({ items: null, next: null, locked: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const reqId = useRef(0);

  const fetcher = tab === 'followers' ? getFollowers : getFollowing;

  // Tải lại khi đổi tab / từ khoá (từ khoá chờ 250ms sau khi ngừng gõ)
  useEffect(() => {
    if (!open) return undefined;
    const id = ++reqId.current;
    setState((s) => ({ ...s, items: null, locked: false }));
    const t = setTimeout(() => {
      fetcher(profile.username, { q })
        .then((r) => id === reqId.current && setState({ items: r.items, next: r.nextCursor, locked: false }))
        .catch((e) => {
          if (id !== reqId.current) return;
          if (isPrivateError(e)) setState({ items: [], next: null, locked: true });
          else { setState({ items: [], next: null, locked: false }); toast.error(errMsg(e)); }
        });
    }, q ? 250 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tab, q, profile.username]);

  useEffect(() => { if (!open) setQ(''); }, [open]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const r = await fetcher(profile.username, { q, cursor: state.next });
      setState((s) => ({ ...s, items: [...s.items, ...r.items.filter((u) => !s.items.some((x) => x._id === u._id))], next: r.nextCursor }));
    } catch (e) { toast.error(errMsg(e)); }
    setLoadingMore(false);
  };

  const patch = (id, change) => setState((s) => ({ ...s, items: s.items.map((u) => (u._id === id ? { ...u, ...change } : u)) }));

  const remove = async (u) => {
    if (!confirm(`Xoá @${u.username} khỏi người theo dõi? Họ sẽ không được thông báo.`)) return;
    try {
      await removeFollower(u._id);
      setState((s) => ({ ...s, items: s.items.filter((x) => x._id !== u._id) }));
      onCountChange?.('followerCount', -1);
      toast('Đã xoá người theo dõi');
    } catch (e) { toast.error(errMsg(e)); }
  };

  const counts = { followers: profile.followerCount ?? 0, following: profile.followingCount ?? 0 };
  return (
    <Modal open={open} onClose={onClose} title={`@${profile.username}`} width={480}>
      <div className="px-5 pb-3">
      <div className="sticky top-0 z-10 -mx-5 bg-surface px-5 pb-3 pt-3">
        <div className="flex border-b border-line" role="tablist">
          {TABS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => onTab(k)} className={`tab flex flex-1 items-center justify-center gap-1.5 ${tab === k ? 'tab-active' : ''}`}>
              {label} <span className="tabular text-xs text-fg-subtle">{formatCount(counts[k])}</span>
              {profile.access && !profile.access[k] && !isMe && <Lock size={12} className="text-fg-subtle" />}
            </button>
          ))}
        </div>
        {!state.locked && (
          <label className="mt-3 flex h-10 items-center gap-2 rounded bg-surface-2 px-3 text-fg-muted focus-within:ring-2 focus-within:ring-brand/30">
            <Search size={16} className="text-fg-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên" className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle" />
          </label>
        )}
      </div>

      {state.locked ? (
        <div className="grid place-items-center py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-2 text-fg-muted"><Lock size={24} /></span>
          <p className="mt-4 font-semibold">Danh sách này đã được ẩn</p>
          <p className="mt-1 max-w-xs text-sm text-fg-muted">@{profile.username} đã ẩn danh sách {tab === 'followers' ? 'người theo dõi' : 'những người họ đang theo dõi'} trong cài đặt quyền riêng tư.</p>
        </div>
      ) : state.items === null ? (
        <ul className="space-y-3 py-2">{[0, 1, 2, 3, 4].map((i) => <li key={i} className="flex items-center gap-3"><span className="skeleton h-11 w-11 rounded-full" /><span className="skeleton h-4 w-40 rounded" /></li>)}</ul>
      ) : !state.items.length ? (
        <p className="py-14 text-center text-sm text-fg-muted">
          {q ? `Không có ai tên “${q}”.` : tab === 'followers' ? 'Chưa có người theo dõi.' : 'Chưa theo dõi ai.'}
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {state.items.map((u) => (
              <li key={u._id} className="flex items-center gap-3 py-3">
                <Link to={`/profile/${u.username}`} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar user={u} size={44} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 truncate font-semibold">
                      {u.displayName || u.username}
                      {u.isVerified && <BadgeCheck size={14} className="shrink-0 text-brand-text" />}
                    </span>
                    <span className="flex items-center gap-1.5 truncate tabular text-[11px] text-fg-subtle">
                      @{u.username}
                      {u.isFollowing && u.followsYou && <span className="rounded-sm bg-brand-soft px-1.5 font-sans font-semibold text-brand-text">Bạn bè</span>}
                      {!u.isFollowing && u.followsYou && !u.isMe && <span className="font-sans">· Theo dõi bạn</span>}
                    </span>
                  </span>
                </Link>
                {!u.isMe && (
                  <FollowButton user={u} size="sm"
                    onChange={({ isFollowing: f }) => {
                      patch(u._id, { isFollowing: f });
                      // Đang xem danh sách "Đang theo dõi" của chính mình → cập nhật số trên hồ sơ
                      if (isMe) onCountChange?.('followingCount', f ? 1 : -1);
                    }} />
                )}
                {isMe && tab === 'followers' && (
                  <button onClick={() => remove(u)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-fg-subtle transition hover:bg-danger/15 hover:text-danger" aria-label={`Xoá @${u.username} khỏi người theo dõi`} title="Xoá người theo dõi">
                    <UserMinus size={17} />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {state.next && (
            <div className="py-3 text-center">
              <button onClick={more} disabled={loadingMore} className="btn-outline btn-sm">{loadingMore ? 'Đang tải…' : 'Xem thêm'}</button>
            </div>
          )}
        </>
      )}
      </div>
    </Modal>
  );
}
