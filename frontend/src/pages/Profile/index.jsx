import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { BarChart3, Ban, Bookmark, Camera, Crop, Globe, Grid3x3, Heart, ImagePlus, Link2, Lock, MoreHorizontal, Pencil, Play, Plus, Repeat2, Shield, Trash2 } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import AvatarCropper from '../../components/profile/AvatarCropper';
import FollowListSheet from '../../components/profile/FollowListSheet';
import FollowButton from '../../components/common/FollowButton';
import { VideoTile } from '../../components/video/VideoCard';
import useAuth from '../../hooks/useAuth';
import { getProfile, updateProfile, uploadAvatar } from '../../api/auth.api';
import { deleteVideo, getLikedVideos, getSavedVideos, getUserReposts, getUserVideos, togglePinVideo } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';
import { blockUser, getUserLiked, unblockUser } from '../../api/user.api';
import { formatCount } from '../../utils/format';

/** Ô số liệu; có onClick thì bấm được (mở danh sách), locked = chủ tài khoản đã ẩn */
function Stat({ value, label, onClick, locked }) {
  const body = (
    <>
      <p className="font-mono text-2xl font-bold tracking-tight">{formatCount(value)}</p>
      <p className="flex items-center gap-1 text-sm text-paper-dim">{label}{locked && <Lock size={12} aria-label="Đã ẩn" />}</p>
    </>
  );
  if (!onClick) return <div>{body}</div>;
  return (
    <button onClick={onClick} className="-m-2 rounded-2xl p-2 text-left transition hover:bg-ink-800" aria-label={`Xem ${label.toLowerCase()}`}>
      {body}
    </button>
  );
}

/** Menu "⋯" trên hồ sơ người khác: sao chép link, chặn / bỏ chặn */
function MoreMenu({ user, onCopy, onBlockToggle }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', h);
    return () => document.removeEventListener('pointerdown', h);
  }, [open]);
  const item = 'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition hover:bg-ink-700';
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="btn-ghost !px-3" aria-label="Tuỳ chọn khác" aria-expanded={open}><MoreHorizontal size={18} /></button>
      {open && (
        <div className="absolute right-0 top-12 z-30 w-56 rounded-2xl border border-ink-600 bg-ink-800 p-1.5 shadow-2xl shadow-black/50" onClick={() => setOpen(false)}>
          <button onClick={onCopy} className={item}><Link2 size={17} /> Sao chép liên kết</button>
          <button onClick={onBlockToggle} className={`${item} ${user.isBlocked ? '' : 'text-coral'}`}>
            <Ban size={17} /> {user.isBlocked ? 'Bỏ chặn' : 'Chặn'} @{user.username}
          </button>
        </div>
      )}
    </div>
  );
}

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

/** Giá trị đưa vào ô nhập khi sửa: @handle nếu biểu diễn được, còn lại là link rút gọn (không mất thông tin) */
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
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
      {items.map(({ key, icon: Icon, label }) => (
        <a
          key={key}
          href={links[key]}
          target="_blank"
          rel="noopener noreferrer nofollow"
          title={label}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-paper hover:text-lime"
        >
          <Icon size={15} className="text-paper-mute" /> {linkText(key, links[key])}
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

function Field({ label, counter, hint, error, children }) {
  return (
    <label className="block">
      <span className="label flex justify-between gap-3">{label}{counter && <span>{counter}</span>}</span>
      <div className="mt-2">{children}</div>
      {error ? <p className="mt-1.5 text-xs font-semibold text-coral">{error}</p> : hint && <p className="mt-1.5 text-xs text-paper-mute">{hint}</p>}
    </label>
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
    setFile(croppedFile);
    setPreview(url);
    setRemoveAvatar(false);
    setCropping(false);
  };

  const shownAvatar = preview || (removeAvatar ? null : user?.avatarUrl);
  const usernameChanged = form.username.trim() !== user?.username;

  const save = async (e) => {
    e.preventDefault();
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
      toast('Đã lưu hồ sơ', { icon: '✓' });
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
    <Modal open={open} onClose={cropping ? () => setCropping(false) : onClose} title={cropping ? 'Căn chỉnh ảnh' : 'Sửa hồ sơ'} variant="center">
      {cropping && rawSrc ? (
        <AvatarCropper src={rawSrc} onCancel={() => setCropping(false)} onApply={applyCrop} />
      ) : (
      <form onSubmit={save} className="space-y-5" noValidate>
        {/* Ảnh đại diện: bấm vào ảnh để chọn file từ máy */}
        <div className="flex flex-col items-center gap-3 py-1">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="group relative rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-lime"
            aria-label="Đổi ảnh đại diện"
          >
            <Avatar user={{ ...user, avatarUrl: shownAvatar }} size={96} />
            <span className="absolute inset-0 grid place-items-center rounded-full bg-black/50 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
              <ImagePlus size={26} />
            </span>
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} className="btn-ghost !px-3 !py-1.5 text-sm">
              <ImagePlus size={15} /> {shownAvatar ? 'Đổi ảnh' : 'Tải ảnh lên'}
            </button>
            {rawSrc && preview && (
              <button type="button" onClick={() => setCropping(true)} className="btn-ghost !px-3 !py-1.5 text-sm">
                <Crop size={15} /> Chỉnh lại
              </button>
            )}
            {shownAvatar && (
              <button
                type="button"
                onClick={() => { setFile(null); setPreview(null); setRawSrc(null); setRemoveAvatar(true); }}
                className="btn-ghost !px-3 !py-1.5 text-sm"
              >
                <Trash2 size={15} /> Gỡ ảnh
              </button>
            )}
          </div>
          <p className="text-xs text-paper-mute">
            {preview ? 'Ảnh mới sẽ được lưu khi bấm "Lưu".' : `JPG, PNG hoặc WebP, tối đa ${MAX_AVATAR_MB} MB — bạn sẽ được căn chỉnh trước khi lưu.`}
          </p>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={pickFile} />
        </div>

        <Field label="Tên hiển thị" counter={`${form.displayName.length}/30`} hint="Tên lớn nhất trên hồ sơ của bạn, đổi bất cứ lúc nào.">
          <input className="input" maxLength={30} value={form.displayName} onChange={set('displayName')} placeholder={user?.username} />
        </Field>

        <Field
          label="Username"
          counter={`${form.username.length}/30`}
          error={errors.username}
          hint={usernameChanged
            ? `Hồ sơ mới: /profile/${form.username || '…'}. Link cũ sẽ không còn dùng được; mỗi 30 ngày chỉ đổi được 1 lần.`
            : 'Dùng trong đường dẫn hồ sơ và khi người khác nhắc đến bạn.'}
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-paper-mute">@</span>
            <input
              className="input !pl-9 font-mono"
              maxLength={30}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={form.username}
              onChange={(e) => set('username')({ target: { value: e.target.value.replace(/\s/g, '') } })}
            />
          </div>
        </Field>

        <Field label="Tiểu sử" counter={`${form.bio.length}/150`}>
          <textarea className="input min-h-[96px] resize-none" maxLength={150} value={form.bio} onChange={set('bio')} placeholder="Giới thiệu đôi chút về bạn" />
        </Field>

        <div className="space-y-2">
          <span className="label">Liên kết</span>
          {LINK_FIELDS.map(({ key, icon: Icon, label, placeholder }) => (
            <div key={key} className="relative">
              <Icon size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-paper-mute" />
              <input
                className="input !pl-10"
                aria-label={label}
                maxLength={200}
                autoCapitalize="none"
                spellCheck={false}
                value={form.links[key]}
                onChange={setLink(key)}
                placeholder={placeholder}
              />
            </div>
          ))}
          {errors.links && <p className="text-xs font-semibold text-coral">{errors.links}</p>}
        </div>

        <Button type="submit" loading={saving} className="w-full">Lưu</Button>
      </form>
      )}
    </Modal>
  );
}

/**
 * Lưới video cho các tab phụ (Đăng lại / Đã tim / Đã lưu), phân trang "Xem thêm".
 * load(cursor) → { videos, nextCursor }; empty = { icon, title, text }
 */
function VideoListTab({ load, empty }) {
  const [videos, setVideos] = useState(null);
  const [next, setNext] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    let alive = true;
    setVideos(null);
    load().then((r) => { if (alive) { setVideos(r.videos); setNext(r.nextCursor); } })
      .catch((e) => { if (alive) { setVideos([]); toast.error(errMsg(e)); } });
    return () => { alive = false; };
  }, [load]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const r = await load(next);
      setVideos((vs) => [...vs, ...r.videos.filter((v) => !vs.some((x) => x._id === v._id))]);
      setNext(r.nextCursor);
    } catch (e) { toast.error(errMsg(e)); }
    setLoadingMore(false);
  };

  if (videos === null) {
    return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 4 }, (_, i) => <span key={i} className="skeleton aspect-[3/4] rounded-2xl" />)}</div>;
  }
  if (!videos.length) {
    const Icon = empty.icon;
    return (
      <div className="card grid place-items-center px-6 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-ink-700 text-lime"><Icon size={26} /></span>
        <p className="mt-4 text-2xl font-extrabold">{empty.title}</p>
        <p className="mt-2 max-w-sm text-paper-dim">{empty.text}</p>
        {empty.cta && <Link to="/" className="btn mt-6">Lướt video</Link>}
      </div>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {videos.map((v, i) => <VideoTile key={v._id} video={v} index={i} from="profile" />)}
      </div>
      {next && (
        <div className="mt-6 text-center">
          <button onClick={more} disabled={loadingMore} className="btn-ghost">{loadingMore ? 'Đang tải…' : 'Xem thêm'}</button>
        </div>
      )}
    </>
  );
}

export default function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user: me, isAdmin, setUser } = useAuth();
  const [user, setProfile] = useState(null);
  const [videos, setVideos] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('videos'); // videos | reposts | liked | saved
  const isMe = me?.username === username;
  const loadReposts = useCallback((cursor) => getUserReposts(username, cursor), [username]);
  const loadTheirLiked = useCallback((cursor) => getUserLiked(username, cursor), [username]);
  const [list, setList] = useState(null); // 'followers' | 'following' | null
  const { isAuthenticated, requireAuth } = useAuth();

  useEffect(() => { setTab('videos'); setList(null); }, [username]);

  const bumpCount = (key, delta) => setProfile((p) => ({ ...p, [key]: Math.max(0, (p?.[key] ?? 0) + delta) }));
  const openList = (k) => setList(k);

  const toggleBlock = async () => {
    if (!requireAuth('Đăng nhập để chặn người dùng')) return;
    if (!user.isBlocked && !confirm(`Chặn @${user.username}?\n\nHai bạn sẽ tự bỏ theo dõi nhau. @${user.username} không xem được hồ sơ, video của bạn, không bình luận, tag hay nhắn tới bạn được. Họ không được thông báo.`)) return;
    try {
      if (user.isBlocked) {
        await unblockUser(user.username);
        setProfile((p) => ({ ...p, isBlocked: false }));
        toast(`Đã bỏ chặn @${user.username}`);
        getUserVideos(user._id).then(setVideos).catch(() => {});
      } else {
        await blockUser(user.username);
        setProfile((p) => ({
          ...p,
          isBlocked: true,
          isFollowing: false,
          followsYou: false,
          isFriend: false,
          followerCount: Math.max(0, p.followerCount - (p.isFollowing ? 1 : 0)),
          followingCount: Math.max(0, p.followingCount - (p.followsYou ? 1 : 0)),
        }));
        toast(`Đã chặn @${user.username}`);
      }
    } catch (e) { toast.error(errMsg(e)); }
  };

  useEffect(() => {
    let alive = true;
    setProfile(null); setVideos(null); setNotFound(false);
    getProfile(username)
      .then((u) => {
        if (!alive) return;
        setProfile(u);
        return getUserVideos(u._id).then((v) => alive && setVideos(v));
      })
      .catch((e) => { if (!alive) return; if (e.response?.status === 404) setNotFound(true); else { setVideos([]); toast.error(errMsg(e)); } });
    return () => { alive = false; };
  }, [username]);

  const remove = async (v) => {
    if (!confirm(`Xoá video “${v.title}”?`)) return;
    setVideos((vs) => vs.filter((x) => x._id !== v._id));
    try { await deleteVideo(v._id); toast('Đã xoá video'); } catch (e) { toast.error(errMsg(e)); }
  };

  // Ghim / bỏ ghim → sắp xếp lại: video ghim (ghim sau đứng trước) lên đầu, còn lại theo thứ tự cũ
  const pin = async (v) => {
    try {
      const r = await togglePinVideo(v._id);
      setVideos((vs) => {
        const next = vs.map((x) => (x._id === v._id ? { ...x, pinnedAt: r.pinnedAt } : x));
        const pinned = next.filter((x) => x.pinnedAt).sort((a, b) => new Date(b.pinnedAt) - new Date(a.pinnedAt));
        const rest = next.filter((x) => !x.pinnedAt).sort((a, b) => (a._id < b._id ? 1 : -1));
        return [...pinned, ...rest];
      });
      toast(r.pinned ? 'Đã ghim lên đầu hồ sơ' : 'Đã bỏ ghim', { icon: '📌' });
    } catch (e) { toast.error(errMsg(e)); }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); toast('Đã sao chép liên kết hồ sơ', { icon: '🔗' }); } catch { /* bỏ qua */ }
  };

  // Admin không có trang hồ sơ cá nhân như người dùng thường
  if (isMe && isAdmin) return <Navigate to="/admin" replace />;

  if (notFound) {
    return (
      <div className="grid h-full place-items-center text-center">
        <div>
          <p className="font-mono text-7xl font-bold text-lime">404</p>
          <p className="mt-3 text-2xl font-extrabold">Không tìm thấy @{username}</p>
          <Link to="/search" className="btn mt-6">Tìm người khác</Link>
        </div>
      </div>
    );
  }

  const likes = user?.totalLikes ?? (videos || []).reduce((a, v) => a + v.likeCount, 0);
  const access = user?.access || { followers: true, following: true, liked: isMe, reposts: true };
  const blocked = Boolean(user?.isBlocked);
  const cover = videos?.find((v) => v.thumbnailUrl)?.thumbnailUrl;

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-4 sm:px-8">
      <div className="grain relative h-44 overflow-hidden rounded-[28px] bg-ink-700 sm:h-56">
        {cover ? (
          <img src={cover} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} className="h-full w-full scale-125 object-cover opacity-70 blur-2xl" />
        ) : (
          <motion.div className="absolute -right-10 -top-20 h-80 w-80 rounded-full border-[44px] border-lime" animate={{ rotate: 360 }} transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}>
            <span className="absolute left-4 top-6 h-12 w-12 rounded-full bg-coral" />
          </motion.div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/70 to-transparent" />
      </div>

      <div className="relative -mt-14 flex flex-wrap items-end gap-5 px-2 sm:px-6">
        {user ? <Avatar user={user} size={112} className="rounded-full ring-[6px] ring-ink" /> : <span className="skeleton h-28 w-28 rounded-full ring-[6px] ring-ink" />}
        <div className="min-w-0 flex-1 pb-1">
          {user ? (
            <>
              <h1 className="break-words text-3xl font-extrabold sm:text-5xl">{user.displayName || user.username}</h1>
              <p className="mt-1 break-all font-mono text-sm text-paper-mute">@{user.username}</p>
              <p className="mt-2 text-paper-dim">{user.bio || (isMe ? 'Thêm tiểu sử để mọi người biết bạn là ai.' : 'Chưa có tiểu sử.')}</p>
              <ProfileLinks links={user.links} />
            </>
          ) : (
            <><span className="skeleton block h-10 w-56 rounded-xl" /><span className="skeleton mt-3 block h-4 w-72 rounded" /></>
          )}
        </div>
        {/* Điện thoại: hàng nút xuống dòng riêng để không ép cột tên */}
        <div className="flex basis-full flex-wrap gap-2 pb-1 sm:basis-auto">
          {isMe && <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil size={16} /> Sửa hồ sơ</button>}
          {isMe && <Link to="/analytics" className="btn-ghost"><BarChart3 size={16} /> Phân tích</Link>}
          {isMe && <Link to="/settings/privacy" className="btn-ghost !px-3" aria-label="Quyền riêng tư" title="Quyền riêng tư"><Shield size={18} /></Link>}
          {!isMe && user && !blocked && (
            <FollowButton user={user} isFollowing={user.isFollowing} followsYou={user.followsYou}
              onChange={(f) => setProfile((p) => ({ ...p, isFollowing: f, isFriend: f && p.followsYou, followerCount: Math.max(0, p.followerCount + (f ? 1 : -1)) }))} />
          )}
          {isMe ? (
            <button onClick={copyLink} className="btn-ghost !px-3" aria-label="Sao chép liên kết"><Link2 size={18} /></button>
          ) : user && (isAuthenticated ? <MoreMenu user={user} onCopy={copyLink} onBlockToggle={toggleBlock} /> : (
            <button onClick={copyLink} className="btn-ghost !px-3" aria-label="Sao chép liên kết"><Link2 size={18} /></button>
          ))}
        </div>
      </div>

      <div className="mt-8 flex gap-10 border-b border-ink-600 px-2 pb-6 sm:px-6">
        <Stat value={user?.followingCount ?? 0} label="Đang theo dõi" locked={!access.following && !isMe} onClick={user && !blocked ? () => openList('following') : undefined} />
        <Stat value={user?.followerCount ?? 0} label="Người theo dõi" locked={!access.followers && !isMe} onClick={user && !blocked ? () => openList('followers') : undefined} />
        <Stat value={likes} label="Lượt thích" />
      </div>

      {blocked ? (
        <div className="card mt-8 grid place-items-center px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-coral/15 text-coral"><Ban size={26} /></span>
          <p className="mt-4 text-2xl font-extrabold">Bạn đã chặn @{username}</p>
          <p className="mt-2 max-w-sm text-paper-dim">Bạn sẽ không thấy video, bình luận của họ và họ không thể tương tác với bạn.</p>
          <button onClick={toggleBlock} className="btn-ghost mt-6">Bỏ chặn</button>
        </div>
      ) : (<>
      <div className="mb-4 mt-8 flex items-center justify-between gap-3">
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-ink-800 p-1" role="tablist">
          {[
            ['videos', Grid3x3, 'Video', videos?.length],
            (isMe || access.reposts) && ['reposts', Repeat2, 'Đăng lại'],
            (isMe || access.liked) && ['liked', Heart, 'Đã tim', null, isMe && user?.privacy?.likedVisibility !== 'everyone'],
            isMe && ['saved', Bookmark, 'Đã lưu', null, true],
          ].filter(Boolean).map(([k, Icon, label, count, priv]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="relative shrink-0 rounded-full px-4 py-2 text-sm font-bold">
              <span className={`absolute inset-0 rounded-full bg-paper transition-opacity duration-200 ${tab === k ? 'opacity-100' : 'opacity-0'}`} />
              <span className={`relative flex items-center gap-1.5 ${tab === k ? 'text-ink' : 'text-paper-dim'}`}>
                <Icon size={15} /> {label}
                {count != null && <span className="font-mono text-xs opacity-60">{count}</span>}
                {priv && <Lock size={12} className="opacity-60" aria-label="Chỉ mình bạn thấy" />}
              </span>
            </button>
          ))}
        </div>
        {isMe && <Link to="/upload" className="btn hidden shrink-0 !py-2 sm:inline-flex"><Plus size={17} /> Đăng video</Link>}
      </div>

      {tab === 'reposts' ? (
        <VideoListTab key={`reposts-${username}`} load={loadReposts}
          empty={{ icon: Repeat2, title: 'Chưa đăng lại video nào', text: isMe ? 'Bấm Chia sẻ → Đăng lại ở video bạn thích để người theo dõi cùng xem.' : `@${username} chưa đăng lại video nào.` }} />
      ) : !isMe && tab === 'liked' ? (
        <VideoListTab key={`liked-${username}`} load={loadTheirLiked}
          empty={{ icon: Heart, title: 'Chưa thả tim video nào', text: `@${username} chưa thả tim video nào.` }} />
      ) : isMe && tab === 'liked' ? (
        <VideoListTab key="liked" load={getLikedVideos}
          empty={{ icon: Heart, title: 'Chưa thả tim video nào', text: 'Video bạn thả tim sẽ nằm ở đây. Chỉ bạn nhìn thấy danh sách này.', cta: true }} />
      ) : isMe && tab === 'saved' ? (
        <VideoListTab key="saved" load={getSavedVideos}
          empty={{ icon: Bookmark, title: 'Chưa lưu video nào', text: 'Bấm biểu tượng lưu bên cạnh video để xem lại sau. Chỉ bạn nhìn thấy danh sách này.', cta: true }} />
      ) : videos === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <span key={i} className="skeleton aspect-[3/4] rounded-2xl" />)}</div>
      ) : videos.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {videos.map((v, i) => <VideoTile key={v._id} video={v} index={i} onDelete={isMe ? remove : undefined} onPin={isMe ? pin : undefined} from="profile" />)}
        </div>
      ) : (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <p className="text-2xl font-extrabold">{isMe ? 'Video đầu tiên của bạn ở đâu?' : 'Chưa có video nào'}</p>
          <p className="mt-2 text-paper-dim">{isMe ? 'Đăng một clip ngắn, AI sẽ lo phần dịch sang 10 ngôn ngữ.' : `@${username} chưa đăng gì.`}</p>
          {isMe && <Link to="/upload" className="btn mt-6"><Plus size={17} /> Tải lên</Link>}
        </div>
      )}
      </>)}

      {user && (
        <FollowListSheet profile={user} isMe={isMe} open={Boolean(list)} tab={list || 'followers'} onTab={setList}
          onClose={() => setList(null)} onCountChange={bumpCount} />
      )}

      {isMe && (
        <EditProfile
          open={editing}
          onClose={() => setEditing(false)}
          user={user}
          onSaved={(u) => {
            setProfile((p) => ({ ...p, ...u }));
            setUser({ ...me, ...u });
            // Đổi username → chuyển sang URL hồ sơ mới
            if (u.username && u.username !== username) navigate(`/profile/${u.username}`, { replace: true });
          }}
        />
      )}
    </div>
  );
}
