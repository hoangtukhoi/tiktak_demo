import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Bookmark, Camera, FileText, Grid3x3, Heart, Link2, Lock, Plus } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import FollowButton from '../../components/common/FollowButton';
import { VideoTile } from '../../components/video/VideoCard';
import useAuth from '../../hooks/useAuth';
import { getFollowers, getFollowing, getProfile, updateProfile, uploadAvatar } from '../../api/auth.api';
import { deleteVideo, getDrafts, getLikedVideos, getSavedVideos, getUserVideos } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount } from '../../utils/format';

function EditProfile({ open, onClose, user, onSaved }) {
  const [bio, setBio] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);
  const input = useRef(null);
  useEffect(() => { if (open) { setBio(user?.bio || ''); setFile(null); setPreview(null); } }, [open, user]);

  const pick = (f) => {
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error('Chọn một file ảnh');
    if (f.size > 5 * 1024 * 1024) return toast.error('Ảnh tối đa 5 MB');
    setFile(f); setPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    setSaving(true);
    try {
      let u = user;
      if (file) u = await uploadAvatar(file);
      if (bio !== (user.bio || '')) u = await updateProfile({ bio });
      onSaved(u);
      toast('Đã cập nhật hồ sơ');
      onClose();
    } catch (e) { toast.error(errMsg(e)); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Sửa hồ sơ" variant="dialog" width={480}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Huỷ</Button><Button loading={saving} onClick={save}>Lưu</Button></div>}>
      <div className="divide-y divide-line px-5">
        <div className="flex items-center gap-5 py-5">
          <span className="w-28 shrink-0 text-sm font-semibold">Ảnh đại diện</span>
          <button type="button" onClick={() => input.current.click()} className="group relative rounded-full" aria-label="Đổi ảnh đại diện">
            <Avatar user={{ ...user, avatarUrl: preview || user?.avatarUrl }} size={88} />
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Camera size={22} /></span>
          </button>
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files[0])} />
        </div>
        <div className="flex gap-5 py-5">
          <span className="w-28 shrink-0 pt-2.5 text-sm font-semibold">Tên người dùng</span>
          <div className="flex-1"><input className="input" value={user?.username || ''} disabled /><p className="hint">tiktak.vn/@{user?.username}</p></div>
        </div>
        <div className="flex gap-5 py-5">
          <span className="w-28 shrink-0 pt-2.5 text-sm font-semibold">Tiểu sử</span>
          <div className="flex-1">
            <textarea className="input min-h-[96px] resize-none" maxLength={150} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Giới thiệu về bạn" />
            <p className="hint tabular text-right">{bio.length}/150</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function PeopleDialog({ user, kind, onClose }) {
  const [list, setList] = useState(null);
  useEffect(() => {
    if (!kind) return;
    setList(null);
    (kind === 'followers' ? getFollowers : getFollowing)(user._id).then(setList).catch(() => setList([]));
  }, [kind, user?._id]);
  return (
    <Modal open={!!kind} onClose={onClose} variant="dialog" width={440} title={kind === 'followers' ? 'Người theo dõi' : 'Đang theo dõi'}>
      <ul className="px-3 py-2">
        {list === null ? [0, 1, 2, 3].map((i) => <li key={i} className="flex items-center gap-3 px-2 py-2"><span className="skeleton h-10 w-10 rounded-full" /><span className="skeleton h-4 w-32 rounded" /></li>)
          : list.length ? list.map((u) => (
            <li key={u._id} className="flex items-center gap-3 rounded px-2 py-2 hover:bg-surface-2">
              <Link to={`/profile/${u.username}`} onClick={onClose} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar user={u} size={40} />
                <span className="min-w-0"><span className="block truncate font-semibold">{u.username}</span><span className="block truncate text-sm text-fg-muted">{u.bio || `${formatCount(u.followerCount || 0)} người theo dõi`}</span></span>
              </Link>
              <FollowButton user={u} size="sm" />
            </li>
          )) : <li className="px-2 py-10 text-center text-fg-muted">Chưa có ai.</li>}
      </ul>
    </Modal>
  );
}

const EMPTY = {
  videos: (me) => [me ? 'Chưa có video nào' : 'Chưa có video', me ? 'Video bạn đăng sẽ xuất hiện ở đây.' : 'Người dùng này chưa đăng video công khai.'],
  liked: () => ['Chưa thích video nào', 'Thả tim video bạn yêu thích để xem lại ở đây.'],
  saved: () => ['Chưa lưu video nào', 'Bấm biểu tượng lưu trên video để cất vào đây. Chỉ bạn thấy mục này.'],
  drafts: () => ['Không có bản nháp', 'Chọn "Lưu nháp" khi tải lên để hoàn thiện sau.'],
};

export default function Profile() {
  const { username } = useParams();
  const [params, setParams] = useSearchParams();
  const { user: me, setUser } = useAuth();
  const [user, setProfile] = useState(null);
  const [videos, setVideos] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [people, setPeople] = useState(null);
  const isMe = me?.username === username;
  const tab = params.get('tab') || 'videos';
  const sort = params.get('sort') || 'latest';
  const setTab = (t) => setParams(t === 'videos' ? {} : { tab: t }, { replace: true });

  useEffect(() => {
    let alive = true;
    setProfile(null); setNotFound(false);
    getProfile(username).then((u) => alive && setProfile(u))
      .catch((e) => { if (alive) e.response?.status === 404 ? setNotFound(true) : toast.error(errMsg(e)); });
    return () => { alive = false; };
  }, [username]);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    setVideos(null);
    const load = { videos: () => getUserVideos(user._id, { sort }), liked: () => getLikedVideos(user._id), saved: getSavedVideos, drafts: getDrafts }[tab];
    (load && !(tab === 'liked' && !isMe) ? load() : Promise.resolve([]))
      .then((v) => alive && setVideos(v)).catch(() => alive && setVideos([]));
    return () => { alive = false; };
  }, [user?._id, tab, sort]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (v) => {
    if (!confirm(`Xoá video “${v.title}”? Không thể hoàn tác.`)) return;
    setVideos((vs) => vs.filter((x) => x._id !== v._id));
    try { await deleteVideo(v._id); toast('Đã xoá video'); } catch (e) { toast.error(errMsg(e)); }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/profile/${username}`); toast('Đã sao chép liên kết hồ sơ'); } catch { /* bỏ qua */ }
  };

  if (notFound) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-lg font-bold">Không tìm thấy tài khoản này</p>
          <p className="mt-1 text-fg-muted">@{username} không tồn tại hoặc đã bị xoá.</p>
          <Link to="/search" className="btn-outline mt-5">Tìm người khác</Link>
        </div>
      </div>
    );
  }

  const tabs = [['videos', 'Video', Grid3x3], ['liked', 'Đã thích', Heart], isMe && ['saved', 'Đã lưu', Bookmark], isMe && ['drafts', 'Bản nháp', FileText]].filter(Boolean);
  const [emptyTitle, emptyText] = (EMPTY[tab] || EMPTY.videos)(isMe);
  const likedHidden = tab === 'liked' && !isMe;

  return (
    <div className="mx-auto max-w-[1080px] px-4 pb-16 pt-6 lg:px-8 lg:pt-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
        {user ? <Avatar user={user} size={112} badge /> : <span className="skeleton h-28 w-28 shrink-0 rounded-full" />}
        <div className="min-w-0 flex-1">
          {user ? (
            <>
              <h1 className="break-all text-2xl font-bold">{user.username}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {isMe ? (
                  <>
                    <button onClick={() => setEditing(true)} className="btn-primary">Sửa hồ sơ</button>
                    <Link to="/upload" className="btn-secondary"><Plus size={16} /> Đăng video</Link>
                  </>
                ) : (
                  <FollowButton user={user} className="min-w-[140px]"
                    onChange={({ isFollowing, followerCount }) => setProfile((u) => ({ ...u, isFollowing, followerCount: followerCount ?? u.followerCount + (isFollowing ? 1 : -1) }))} />
                )}
                <button onClick={copyLink} className="btn-secondary !px-3" aria-label="Sao chép liên kết hồ sơ"><Link2 size={18} /></button>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-base">
                <button onClick={() => setPeople('following')} className="hover:underline"><b className="tabular font-bold">{formatCount(user.followingCount || 0)}</b> <span className="text-fg-muted">Đang theo dõi</span></button>
                <button onClick={() => setPeople('followers')} className="hover:underline"><b className="tabular font-bold">{formatCount(user.followerCount || 0)}</b> <span className="text-fg-muted">Người theo dõi</span></button>
                <span><b className="tabular font-bold">{formatCount(user.likeTotal ?? 0)}</b> <span className="text-fg-muted">Lượt thích</span></span>
              </div>
              <p className="mt-3 max-w-prose whitespace-pre-wrap text-base">{user.bio || <span className="text-fg-muted">Chưa có tiểu sử.</span>}</p>
            </>
          ) : (
            <><span className="skeleton block h-8 w-48 rounded" /><span className="skeleton mt-4 block h-10 w-40 rounded" /><span className="skeleton mt-4 block h-4 w-72 rounded" /></>
          )}
        </div>
      </header>

      <nav className="mt-8 flex gap-6 border-b border-line" role="tablist">
        {tabs.map(([k, label, Icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`tab inline-flex items-center gap-1.5 ${tab === k ? 'tab-active' : ''}`}>
            {k === 'saved' || k === 'drafts' ? <Lock size={14} /> : <Icon size={16} />} {label}
          </button>
        ))}
        {tab === 'videos' && (
          <div className="ml-auto hidden items-center gap-1 self-center pb-2 sm:flex" role="group" aria-label="Sắp xếp">
            {[['latest', 'Mới nhất'], ['popular', 'Phổ biến']].map(([k, l]) => (
              <button key={k} onClick={() => setParams(k === 'latest' ? {} : { sort: k }, { replace: true })} aria-pressed={sort === k}
                className={`rounded px-3 py-1 text-sm font-semibold ${sort === k ? 'bg-surface-2 text-fg' : 'text-fg-muted hover:text-fg'}`}>{l}</button>
            ))}
          </div>
        )}
      </nav>

      <div className="mt-5">
        {likedHidden ? (
          <div className="py-16 text-center"><Lock className="mx-auto text-fg-subtle" size={32} strokeWidth={1.5} /><p className="mt-3 font-semibold">Video đã thích của người dùng này là riêng tư</p></div>
        ) : videos === null ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <span key={i} className="skeleton aspect-[3/4] rounded-md" />)}</div>
        ) : videos.length ? (
          <div className="grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 lg:grid-cols-5">
            {videos.map((v, i) => <VideoTile key={v._id} video={v} index={i} onDelete={isMe && (tab === 'videos' || tab === 'drafts') ? remove : undefined} />)}
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="text-md font-semibold">{emptyTitle}</p>
            <p className="mt-1 text-fg-muted">{emptyText}</p>
            {isMe && tab === 'videos' && <Link to="/upload" className="btn-primary mt-5"><Plus size={16} /> Tải video lên</Link>}
          </div>
        )}
      </div>

      {isMe && user && <EditProfile open={editing} onClose={() => setEditing(false)} user={user} onSaved={(u) => { setProfile((p) => ({ ...p, ...u })); setUser({ ...me, ...u }); }} />}
      {user && <PeopleDialog user={user} kind={people} onClose={() => setPeople(null)} />}
    </div>
  );
}
