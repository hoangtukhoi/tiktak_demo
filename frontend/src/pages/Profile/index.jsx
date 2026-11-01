import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { BarChart3, Camera, Crop, Globe, ImagePlus, Link2, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import AvatarCropper from '../../components/profile/AvatarCropper';
import { VideoTile } from '../../components/video/VideoCard';
import useAuth from '../../hooks/useAuth';
import { getProfile, updateProfile, uploadAvatar } from '../../api/auth.api';
import { deleteVideo, getUserVideos } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount } from '../../utils/format';

function Stat({ value, label }) {
  return (
    <div>
      <p className="font-mono text-2xl font-bold tracking-tight">{formatCount(value)}</p>
      <p className="text-sm text-paper-dim">{label}</p>
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

export default function Profile() {
  const { username } = useParams();
  const navigate = useNavigate();
  const { user: me, setUser } = useAuth();
  const [user, setProfile] = useState(null);
  const [videos, setVideos] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const isMe = me?.username === username;

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

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(location.href); toast('Đã sao chép liên kết hồ sơ', { icon: '🔗' }); } catch { /* bỏ qua */ }
  };

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

  const likes = (videos || []).reduce((a, v) => a + v.likeCount, 0);
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
        <div className="flex gap-2 pb-1">
          {isMe && <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil size={16} /> Sửa hồ sơ</button>}
          {isMe && <Link to="/analytics" className="btn-ghost"><BarChart3 size={16} /> Phân tích</Link>}
          <button onClick={copyLink} className="btn-ghost !px-3" aria-label="Sao chép liên kết"><Link2 size={18} /></button>
        </div>
      </div>

      <div className="mt-8 flex gap-10 border-b border-ink-600 px-2 pb-6 sm:px-6">
        <Stat value={user?.followingCount ?? 0} label="Đang theo dõi" />
        <Stat value={user?.followerCount ?? 0} label="Người theo dõi" />
        <Stat value={likes} label="Lượt thích" />
      </div>

      <div className="mb-4 mt-8 flex items-baseline justify-between">
        <h2 className="text-2xl font-extrabold">Video <span className="font-mono text-base text-paper-mute">{videos?.length ?? ''}</span></h2>
        {isMe && <Link to="/upload" className="btn !py-2"><Plus size={17} /> Đăng video</Link>}
      </div>

      {videos === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <span key={i} className="skeleton aspect-[3/4] rounded-2xl" />)}</div>
      ) : videos.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {videos.map((v, i) => <VideoTile key={v._id} video={v} index={i} onDelete={isMe ? remove : undefined} from="profile" />)}
        </div>
      ) : (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <p className="text-2xl font-extrabold">{isMe ? 'Video đầu tiên của bạn ở đâu?' : 'Chưa có video nào'}</p>
          <p className="mt-2 text-paper-dim">{isMe ? 'Đăng một clip ngắn, AI sẽ lo phần dịch sang 10 ngôn ngữ.' : `@${username} chưa đăng gì.`}</p>
          {isMe && <Link to="/upload" className="btn mt-6"><Plus size={17} /> Tải lên</Link>}
        </div>
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
