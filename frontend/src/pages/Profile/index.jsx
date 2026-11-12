import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Ban, BarChart3, Bookmark, Camera, Crop, FileText, Flag, Globe, Grid3x3, Heart, ImagePlus, KeyRound, Link2, Lock, MoreHorizontal, Play, Plus, Repeat2, Shield, ShieldCheck, Trash2,
} from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Menu from '../../components/common/Menu';
import FollowButton from '../../components/common/FollowButton';
import ReportDialog from '../../components/common/ReportDialog';
import AvatarCropper from '../../components/profile/AvatarCropper';
import FollowListSheet from '../../components/profile/FollowListSheet';
import { VideoTile } from '../../components/video/VideoCard';
import useAuth from '../../hooks/useAuth';
import { getProfile, updateProfile, uploadAvatar } from '../../api/auth.api';
import { deleteVideo, getDrafts, getLikedVideos, getSavedVideos, getUserReposts, getUserVideos, togglePinVideo } from '../../api/video.api';
import { blockUser, changePassword, isPrivateError, unblockUser } from '../../api/user.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount } from '../../utils/format';

// ── Liên kết ngoài ───────────────────────────────────────────────────────────
const LINK_FIELDS = [
  { key: 'website', icon: Globe, label: 'Website', placeholder: 'tenban.com' },
  { key: 'instagram', icon: Camera, label: 'Instagram', placeholder: '@ten_tai_khoan hoặc link instagram.com' },
  { key: 'youtube', icon: Play, label: 'YouTube', placeholder: '@kenh hoặc link youtube.com' },
];

/** Chữ ngắn gọn để hiển thị link trên hồ sơ: tenban.com, @alice, @AliceDev */
const linkText = (key, url) => {
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/+$/, '');
    if (key === 'instagram' && path) return '@' + path.split('/').filter(Boolean)[0];
    if (key === 'youtube' && path.startsWith('/@')) return path.slice(1).split('/')[0];
    return (u.hostname.replace(/^www\./, '') + (key === 'website' && path ? path : '')).slice(0, 40);
  } catch {
    return url;
  }
};

/** Giá trị đưa vào ô nhập khi sửa: @handle nếu biểu diễn được, còn lại là link rút gọn */
const linkInputValue = (key, url) => {
  if (!url) return '';
  const bare = url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    if (key === 'instagram' && segs.length === 1) return '@' + segs[0];
    if (key === 'youtube' && segs.length === 1 && segs[0].startsWith('@')) return segs[0];
  } catch { /* giữ nguyên */ }
  return bare;
};

function ProfileLinks({ links }) {
  const items = LINK_FIELDS.filter((f) => links?.[f.key]);
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
      {items.map(({ key, icon: Icon, label }) => (
        <a key={key} href={links[key]} target="_blank" rel="noopener noreferrer nofollow" title={label}
          className="inline-flex items-center gap-1.5 text-sm font-semibold hover:text-brand-text hover:underline">
          <Icon size={15} className="text-fg-muted" /> {linkText(key, links[key])}
        </a>
      ))}
    </div>
  );
}

// ── Form sửa hồ sơ ───────────────────────────────────────────────────────────
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;
const MAX_AVATAR_MB = 20; // ảnh gốc; sau khi cắt chỉ còn ~50–150 KB
const initForm = (u) => ({
  displayName: u?.displayName || '',
  username: u?.username || '',
  bio: u?.bio || '',
  links: Object.fromEntries(LINK_FIELDS.map(({ key }) => [key, linkInputValue(key, u?.links?.[key])])),
});

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5 py-4 sm:flex-row sm:gap-5">
      <span className="shrink-0 text-sm font-semibold sm:w-28 sm:pt-2.5">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function EditProfile({ open, onClose, user, onSaved }) {
  const fileRef = useRef(null);
  const [form, setForm] = useState(() => initForm(user));
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null); // ảnh đã cắt
  const [rawSrc, setRawSrc] = useState(null); // ảnh gốc vừa chọn (để chỉnh lại)
  const [cropping, setCropping] = useState(false);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initForm(user)); setFile(null); setPreview(null); setRawSrc(null); setCropping(false); setRemoveAvatar(false); setErrors({});
  }, [user, open]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);
  useEffect(() => () => rawSrc && URL.revokeObjectURL(rawSrc), [rawSrc]);

  const set = (key) => (e) => { setForm((f) => ({ ...f, [key]: e.target.value })); setErrors((er) => ({ ...er, [key]: null })); };
  const setLink = (key) => (e) => { setForm((f) => ({ ...f, links: { ...f.links, [key]: e.target.value } })); setErrors((er) => ({ ...er, links: null })); };

  const pickFile = (e) => {
    const f = e.target.files?.[0];
    e.target.value = ''; // cho phép chọn lại cùng một file
    if (!f) return;
    if (!f.type.startsWith('image/')) return toast.error('Hãy chọn file ảnh (JPG, PNG, WebP)');
    if (f.size > MAX_AVATAR_MB * 1048576) return toast.error(`Ảnh tối đa ${MAX_AVATAR_MB} MB`);
    // Mở màn căn chỉnh; chỉ khi bấm "Áp dụng" mới thay ảnh trong form
    setRawSrc(URL.createObjectURL(f));
    setCropping(true);
  };

  const applyCrop = (croppedFile, url) => {
    setFile(croppedFile); setPreview(url); setRemoveAvatar(false); setCropping(false);
  };

  const shownAvatar = preview || (removeAvatar ? null : user?.avatarUrl);
  const usernameChanged = form.username.trim() !== user?.username;

  const save = async () => {
    const username = form.username.trim();
    if (!USERNAME_RE.test(username)) {
      setErrors({ username: 'Từ 3–30 ký tự, chỉ gồm chữ không dấu, số và dấu gạch dưới (_)' });
      return;
    }
    setSaving(true);
    let latest = user;
    try {
      if (file) {
        latest = await uploadAvatar(file);
        onSaved(latest); // ảnh đã lưu dù bước sau có lỗi
      }
      const payload = { displayName: form.displayName.trim(), bio: form.bio, links: form.links };
      if (usernameChanged) payload.username = username;
      if (removeAvatar && !file) payload.avatarUrl = null;
      latest = await updateProfile(payload);
      onSaved(latest);
      toast('Đã cập nhật hồ sơ');
      onClose();
    } catch (err) {
      const msg = errMsg(err);
      if (/username/i.test(msg)) setErrors({ username: msg });
      else if (/website|instagram|youtube/i.test(msg)) setErrors({ links: msg });
      toast.error(msg);
    }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={cropping ? () => setCropping(false) : onClose} title={cropping ? 'Căn chỉnh ảnh' : 'Sửa hồ sơ'} variant="dialog" width={520}
      footer={cropping ? null : (
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Huỷ</Button><Button loading={saving} onClick={save}>Lưu</Button></div>
      )}>
      {cropping && rawSrc ? (
        <div className="px-5 py-4"><AvatarCropper src={rawSrc} onCancel={() => setCropping(false)} onApply={applyCrop} /></div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate className="divide-y divide-line px-5">
          <div className="flex items-center gap-5 py-5">
            <span className="hidden w-28 shrink-0 text-sm font-semibold sm:block">Ảnh đại diện</span>
            <button type="button" onClick={() => fileRef.current?.click()} className="group relative rounded-full" aria-label="Đổi ảnh đại diện">
              <Avatar user={{ ...user, avatarUrl: shownAvatar }} size={88} />
              <span className="absolute inset-0 grid place-items-center rounded-full bg-black/40 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><ImagePlus size={22} /></span>
            </button>
            <div className="flex min-w-0 flex-col items-start gap-1.5">
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary btn-sm"><ImagePlus size={14} /> {shownAvatar ? 'Đổi ảnh' : 'Tải ảnh lên'}</button>
                {rawSrc && preview && <button type="button" onClick={() => setCropping(true)} className="btn-ghost btn-sm"><Crop size={14} /> Chỉnh lại</button>}
                {shownAvatar && (
                  <button type="button" onClick={() => { setFile(null); setPreview(null); setRawSrc(null); setRemoveAvatar(true); }} className="btn-ghost btn-sm"><Trash2 size={14} /> Gỡ ảnh</button>
                )}
              </div>
              <p className="hint">{preview ? 'Ảnh mới sẽ được lưu khi bấm "Lưu".' : `JPG, PNG hoặc WebP, tối đa ${MAX_AVATAR_MB} MB.`}</p>
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={pickFile} />
          </div>

          <Row label="Tên hiển thị">
            <input className="input" maxLength={30} value={form.displayName} onChange={set('displayName')} placeholder={user?.username} />
            <p className="hint flex justify-between gap-3"><span>Tên lớn nhất trên hồ sơ của bạn.</span><span className="tabular">{form.displayName.length}/30</span></p>
          </Row>

          <Row label="Tên người dùng">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle">@</span>
              <input className="input !pl-7" maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={form.username}
                onChange={(e) => set('username')({ target: { value: e.target.value.replace(/\s/g, '') } })} />
            </div>
            {errors.username ? <p className="mt-1 text-xs font-semibold text-danger">{errors.username}</p> : (
              <p className="hint">{usernameChanged ? `Hồ sơ mới: /profile/${form.username || '…'} — link cũ sẽ không dùng được, 30 ngày chỉ đổi 1 lần.` : `tiktak.vn/@${user?.username}`}</p>
            )}
          </Row>

          <Row label="Tiểu sử">
            <textarea className="input min-h-[96px] resize-none" maxLength={150} value={form.bio} onChange={set('bio')} placeholder="Giới thiệu về bạn" />
            <p className="hint tabular text-right">{form.bio.length}/150</p>
          </Row>

          <Row label="Liên kết">
            <div className="space-y-2">
              {LINK_FIELDS.map(({ key, icon: Icon, label, placeholder }) => (
                <div key={key} className="relative">
                  <Icon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" />
                  <input className="input !pl-9" aria-label={label} maxLength={200} autoCapitalize="none" spellCheck={false}
                    value={form.links[key]} onChange={setLink(key)} placeholder={placeholder} />
                </div>
              ))}
              {errors.links && <p className="text-xs font-semibold text-danger">{errors.links}</p>}
            </div>
          </Row>
          <button type="submit" hidden />
        </form>
      )}
    </Modal>
  );
}

// ── Đổi mật khẩu ─────────────────────────────────────────────────────────────
const EMPTY_PW = { currentPassword: '', newPassword: '', confirm: '' };

function ChangePassword({ open, onClose }) {
  const [form, setForm] = useState(EMPTY_PW);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setError(''); };

  useEffect(() => { if (open) { setForm(EMPTY_PW); setError(''); } }, [open]);

  const save = async () => {
    if (form.newPassword.length < 6) return setError('Mật khẩu mới phải có ít nhất 6 ký tự');
    if (form.newPassword !== form.confirm) return setError('Mật khẩu nhập lại không khớp');
    if (form.newPassword === form.currentPassword) return setError('Mật khẩu mới phải khác mật khẩu hiện tại');
    setSaving(true);
    try {
      await changePassword(form.currentPassword, form.newPassword);
      toast('Đã đổi mật khẩu. Các thiết bị khác đã bị đăng xuất.');
      onClose();
    } catch (err) {
      setError(errMsg(err));
    }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Đổi mật khẩu" variant="dialog" width={440}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Huỷ</Button><Button loading={saving} onClick={save}>Đổi mật khẩu</Button></div>}>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate className="space-y-4 px-5 py-5">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Mật khẩu hiện tại</span>
          <input type="password" className="input" autoComplete="current-password" maxLength={128} value={form.currentPassword} onChange={set('currentPassword')} />
          <p className="hint">Để trống nếu bạn đăng nhập bằng Google và chưa từng đặt mật khẩu.</p>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Mật khẩu mới</span>
          <input type="password" className="input" autoComplete="new-password" maxLength={128} value={form.newPassword} onChange={set('newPassword')} />
          <p className="hint">Ít nhất 6 ký tự.</p>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold">Nhập lại mật khẩu mới</span>
          <input type="password" className="input" autoComplete="new-password" maxLength={128} value={form.confirm} onChange={set('confirm')} />
        </label>
        {error && <p className="text-xs font-semibold text-danger">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

// ── Lưới video theo tab, phân trang "Xem thêm" ───────────────────────────────
const EMPTY = {
  videos: (me) => [me ? 'Chưa có video nào' : 'Chưa có video', me ? 'Video bạn đăng sẽ xuất hiện ở đây.' : 'Người dùng này chưa đăng video công khai.'],
  reposts: (me) => ['Chưa đăng lại video nào', me ? 'Bấm Chia sẻ → Đăng lại ở video bạn thích để người theo dõi cùng xem.' : 'Người dùng này chưa đăng lại video nào.'],
  liked: (me) => ['Chưa thích video nào', me ? 'Thả tim video bạn yêu thích để xem lại ở đây.' : 'Người dùng này chưa thả tim video nào.'],
  saved: () => ['Chưa lưu video nào', 'Bấm biểu tượng lưu trên video để cất vào đây. Chỉ bạn thấy mục này.'],
  drafts: () => ['Không có bản nháp', 'Chọn "Lưu nháp" khi tải lên để hoàn thiện sau.'],
};

const GRID = 'grid grid-cols-3 gap-x-2 gap-y-4 sm:grid-cols-4 lg:grid-cols-5';

export default function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user: me, isAdmin, isStaff, isAuthenticated, requireAuth, setUser } = useAuth();
  const [reporting, setReporting] = useState(false);
  const [user, setProfile] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const [people, setPeople] = useState(null); // 'followers' | 'following' | null
  const [list, setList] = useState({ videos: null, next: null, locked: false });
  const [loadingMore, setLoadingMore] = useState(false);
  const isMe = me?.username === username;
  const tab = params.get('tab') || 'videos';
  const sort = params.get('sort') || 'latest';
  const setTab = (t) => setParams(t === 'videos' ? {} : { tab: t }, { replace: true });

  useEffect(() => {
    let alive = true;
    setProfile(null); setNotFound(false); setPeople(null);
    getProfile(username).then((u) => alive && setProfile(u))
      .catch((e) => { if (alive) e.response?.status === 404 ? setNotFound(true) : toast.error(errMsg(e)); });
    return () => { alive = false; };
  }, [username]);

  const blocked = Boolean(user?.isBlocked);
  // access: quyền xem các mục theo cài đặt quyền riêng tư của chủ hồ sơ (backend tính sẵn)
  const access = user?.access || { followers: true, following: true, liked: isMe, reposts: true };

  const load = useCallback((cursor) => {
    const id = user?._id;
    return {
      videos: () => getUserVideos(id, { cursor, sort }),
      reposts: () => getUserReposts(id, cursor),
      liked: () => getLikedVideos(id, cursor),
      saved: () => getSavedVideos(cursor),
      drafts: () => getDrafts(cursor),
    }[tab]?.() ?? Promise.resolve({ videos: [], nextCursor: null });
  }, [user?._id, tab, sort]);

  useEffect(() => {
    if (!user || blocked) return undefined;
    let alive = true;
    setList({ videos: null, next: null, locked: false });
    load().then((r) => alive && setList({ videos: r.videos, next: r.nextCursor, locked: false }))
      .catch((e) => alive && setList({ videos: [], next: null, locked: isPrivateError(e) }));
    return () => { alive = false; };
  }, [load, blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const more = async () => {
    setLoadingMore(true);
    try {
      const r = await load(list.next);
      setList((s) => ({ ...s, videos: [...s.videos, ...r.videos.filter((v) => !s.videos.some((x) => x._id === v._id))], next: r.nextCursor }));
    } catch (e) { toast.error(errMsg(e)); }
    setLoadingMore(false);
  };

  const setVideos = (fn) => setList((s) => ({ ...s, videos: fn(s.videos) }));
  const bumpCount = (key, delta) => setProfile((p) => ({ ...p, [key]: Math.max(0, (p?.[key] ?? 0) + delta) }));

  const remove = async (v) => {
    if (!confirm(`Xoá video “${v.title}”? Không thể hoàn tác.`)) return;
    setVideos((vs) => vs.filter((x) => x._id !== v._id));
    try { await deleteVideo(v._id); toast('Đã xoá video'); } catch (e) { toast.error(errMsg(e)); }
  };

  // Ghim / bỏ ghim → video ghim (ghim sau đứng trước) lên đầu, còn lại giữ thứ tự mới nhất
  const pin = async (v) => {
    try {
      const r = await togglePinVideo(v._id);
      setVideos((vs) => {
        const next = vs.map((x) => (x._id === v._id ? { ...x, pinnedAt: r.pinnedAt } : x));
        const pinned = next.filter((x) => x.pinnedAt).sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt));
        const rest = next.filter((x) => !x.pinnedAt).sort((a, b) => (a._id < b._id ? 1 : -1));
        return [...pinned, ...rest];
      });
      toast(r.pinned ? 'Đã ghim lên đầu hồ sơ' : 'Đã bỏ ghim');
    } catch (e) { toast.error(errMsg(e)); }
  };

  const toggleBlock = async () => {
    if (!requireAuth('Đăng nhập để chặn người dùng')) return;
    if (!user.isBlocked && !confirm(`Chặn @${user.username}?\n\nHai bạn sẽ tự bỏ theo dõi nhau. @${user.username} không xem được hồ sơ, video của bạn, không bình luận hay tag bạn được. Họ không được thông báo.`)) return;
    try {
      if (user.isBlocked) {
        await unblockUser(user.username);
        setProfile((p) => ({ ...p, isBlocked: false }));
        toast(`Đã bỏ chặn @${user.username}`);
      } else {
        await blockUser(user.username);
        setProfile((p) => ({
          ...p, isBlocked: true, isFollowing: false, followsYou: false, isFriend: false,
          followerCount: Math.max(0, p.followerCount - (p.isFollowing ? 1 : 0)),
          followingCount: Math.max(0, p.followingCount - (p.followsYou ? 1 : 0)),
        }));
        toast(`Đã chặn @${user.username}`);
      }
    } catch (e) { toast.error(errMsg(e)); }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/profile/${username}`); toast('Đã sao chép liên kết hồ sơ'); } catch { /* bỏ qua */ }
  };

  // Admin không có trang hồ sơ cá nhân như người dùng thường
  if (isMe && isAdmin) return <Navigate to="/admin" replace />;

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

  const tabs = [
    ['videos', 'Video', Grid3x3],
    (isMe || access.reposts) && ['reposts', 'Đăng lại', Repeat2],
    ['liked', 'Đã thích', Heart, isMe && user?.privacy?.likedVisibility && user.privacy.likedVisibility !== 'everyone'],
    isMe && ['saved', 'Đã lưu', Bookmark, true],
    isMe && ['drafts', 'Bản nháp', FileText, true],
  ].filter(Boolean);
  const [emptyTitle, emptyText] = (EMPTY[tab] || EMPTY.videos)(isMe);
  const locked = list.locked || (tab === 'liked' && !isMe && user && !access.liked);
  const { videos } = list;

  const StatBtn = ({ k, value, label }) => {
    const hidden = !isMe && user && !access[k];
    return (
      <button onClick={() => !blocked && setPeople(k)} disabled={blocked} className="inline-flex items-center gap-1 hover:underline disabled:no-underline">
        <b className="tabular font-bold">{formatCount(value || 0)}</b> <span className="text-fg-muted">{label}</span>
        {hidden && <Lock size={12} className="text-fg-subtle" aria-label="Đã ẩn" />}
      </button>
    );
  };

  return (
    <div className="mx-auto max-w-[1080px] px-4 pb-16 pt-6 lg:px-8 lg:pt-10">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-7">
        {user ? <Avatar user={user} size={112} badge /> : <span className="skeleton h-28 w-28 shrink-0 rounded-full" />}
        <div className="min-w-0 flex-1">
          {user ? (
            <>
              <h1 className="break-all text-2xl font-bold">{user.username}</h1>
              {user.bannedAt && <p className="mt-1 inline-flex items-center gap-1.5 rounded bg-danger/10 px-2 py-0.5 text-sm font-semibold text-danger"><Ban size={14} /> Tài khoản đang bị khoá{user.banReason ? ` — ${user.banReason}` : ''}</p>}
              {user.displayName && user.displayName !== user.username && <p className="mt-0.5 text-md font-semibold text-fg-muted">{user.displayName}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {isMe ? (
                  <>
                    <button onClick={() => setEditing(true)} className="btn-primary">Sửa hồ sơ</button>
                    <Link to="/upload" className="btn-secondary"><Plus size={16} /> Đăng video</Link>
                    <Link to="/analytics" className="btn-secondary"><BarChart3 size={16} /> Phân tích</Link>
                    {isStaff && <Link to="/admin" className="btn-secondary"><ShieldCheck size={16} /> Kiểm duyệt</Link>}
                    <Link to="/settings/privacy" className="btn-secondary !px-3" aria-label="Quyền riêng tư" title="Quyền riêng tư"><Shield size={18} /></Link>
                    <button onClick={() => setChangingPw(true)} className="btn-secondary !px-3" aria-label="Đổi mật khẩu" title="Đổi mật khẩu"><KeyRound size={18} /></button>
                    <button onClick={copyLink} className="btn-secondary !px-3" aria-label="Sao chép liên kết hồ sơ"><Link2 size={18} /></button>
                  </>
                ) : (
                  <>
                    {!blocked && (
                      <FollowButton user={user} className="min-w-[140px]"
                        onChange={({ isFollowing, followerCount }) => setProfile((u) => ({
                          ...u, isFollowing, isFriend: isFollowing && u.followsYou,
                          followerCount: followerCount ?? Math.max(0, u.followerCount + (isFollowing ? 1 : -1)),
                        }))} />
                    )}
                    {isAuthenticated ? (
                      <Menu trigger={({ toggle }) => (
                        <button onClick={toggle} className="btn-secondary !px-3" aria-label="Tuỳ chọn khác"><MoreHorizontal size={18} /></button>
                      )} items={[
                        { label: 'Sao chép liên kết', icon: Link2, onClick: copyLink },
                        { label: `${blocked ? 'Bỏ chặn' : 'Chặn'} @${user.username}`, icon: Ban, onClick: toggleBlock, danger: !blocked },
                        ...(isStaff || user.role === 'admin' ? [] : [{ label: 'Báo cáo tài khoản', icon: Flag, onClick: () => setReporting(true), danger: true }]),
                      ]} />
                    ) : (
                      <button onClick={copyLink} className="btn-secondary !px-3" aria-label="Sao chép liên kết hồ sơ"><Link2 size={18} /></button>
                    )}
                  </>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-base">
                <StatBtn k="following" value={user.followingCount} label="Đang theo dõi" />
                <StatBtn k="followers" value={user.followerCount} label="Người theo dõi" />
                <span><b className="tabular font-bold">{formatCount(user.likeTotal ?? user.totalLikes ?? 0)}</b> <span className="text-fg-muted">Lượt thích</span></span>
              </div>
              <p className="mt-3 max-w-prose whitespace-pre-wrap text-base">{user.bio || <span className="text-fg-muted">Chưa có tiểu sử.</span>}</p>
              <ProfileLinks links={user.links} />
            </>
          ) : (
            <><span className="skeleton block h-8 w-48 rounded" /><span className="skeleton mt-4 block h-10 w-40 rounded" /><span className="skeleton mt-4 block h-4 w-72 rounded" /></>
          )}
        </div>
      </header>

      {blocked ? (
        <div className="mt-10 py-12 text-center">
          <Ban className="mx-auto text-danger" size={32} strokeWidth={1.5} />
          <p className="mt-3 text-md font-semibold">Bạn đã chặn @{username}</p>
          <p className="mx-auto mt-1 max-w-sm text-fg-muted">Bạn sẽ không thấy video, bình luận của họ và họ không thể tương tác với bạn.</p>
          <button onClick={toggleBlock} className="btn-outline mt-5">Bỏ chặn</button>
        </div>
      ) : (
        <>
          <nav className="no-scrollbar mt-8 flex gap-6 overflow-x-auto border-b border-line" role="tablist">
            {tabs.map(([k, label, Icon, priv]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`tab inline-flex shrink-0 items-center gap-1.5 ${tab === k ? 'tab-active' : ''}`}>
                {priv ? <Lock size={14} aria-label="Chỉ mình bạn thấy" /> : <Icon size={16} />} {label}
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
            {locked ? (
              <div className="py-16 text-center">
                <Lock className="mx-auto text-fg-subtle" size={32} strokeWidth={1.5} />
                <p className="mt-3 font-semibold">{tab === 'reposts' ? 'Video đã đăng lại' : 'Video đã thích'} của người dùng này là riêng tư</p>
              </div>
            ) : videos === null ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <span key={i} className="skeleton aspect-[3/4] rounded-md" />)}</div>
            ) : videos.length ? (
              <>
                <div className={GRID}>
                  {videos.map((v, i) => (
                    <VideoTile key={v._id} video={v} index={i} from="profile"
                      onDelete={isMe && (tab === 'videos' || tab === 'drafts') ? remove : undefined}
                      onPin={isMe && tab === 'videos' ? pin : undefined} />
                  ))}
                </div>
                {list.next != null && (
                  <div className="mt-6 text-center">
                    <button onClick={more} disabled={loadingMore} className="btn-outline">{loadingMore ? 'Đang tải…' : 'Xem thêm'}</button>
                  </div>
                )}
              </>
            ) : (
              <div className="py-16 text-center">
                <p className="text-md font-semibold">{emptyTitle}</p>
                <p className="mx-auto mt-1 max-w-sm text-fg-muted">{emptyText}</p>
                {isMe && tab === 'videos' && <Link to="/upload" className="btn-primary mt-5"><Plus size={16} /> Tải video lên</Link>}
              </div>
            )}
          </div>
        </>
      )}

      {isMe && user && (
        <EditProfile open={editing} onClose={() => setEditing(false)} user={user}
          onSaved={(u) => {
            setProfile((p) => ({ ...p, ...u }));
            setUser({ ...me, ...u });
            // Đổi username → chuyển sang URL hồ sơ mới
            if (u.username && u.username !== username) navigate(`/profile/${u.username}`, { replace: true });
          }} />
      )}
      {user && !isMe && <ReportDialog type="user" targetId={user.username} open={reporting} onClose={() => setReporting(false)} />}
      {isMe && <ChangePassword open={changingPw} onClose={() => setChangingPw(false)} />}
      {user && (
        <FollowListSheet profile={user} isMe={isMe} open={!!people} tab={people || 'followers'} onTab={setPeople}
          onClose={() => setPeople(null)} onCountChange={bumpCount} />
      )}
    </div>
  );
}
