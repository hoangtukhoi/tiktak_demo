import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Link2, Pencil, Plus } from 'lucide-react';
import Avatar from '../../components/common/Avatar';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import { VideoTile } from '../../components/video/VideoCard';
import useAuth from '../../hooks/useAuth';
import { getProfile, updateProfile } from '../../api/auth.api';
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

function EditProfile({ open, onClose, user, onSaved }) {
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setBio(user?.bio || ''); setAvatarUrl(user?.avatarUrl || ''); }, [user, open]);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      onSaved(await updateProfile({ bio, avatarUrl: avatarUrl || null }));
      toast('Đã lưu hồ sơ', { icon: '✓' });
      onClose();
    } catch (err) { toast.error(errMsg(err)); }
    setSaving(false);
  };

  return (
    <Modal open={open} onClose={onClose} title="Sửa hồ sơ" variant="center">
      <form onSubmit={save} className="space-y-4">
        <div className="flex justify-center py-2"><Avatar user={{ ...user, avatarUrl }} size={88} /></div>
        <label className="block">
          <span className="label">Ảnh đại diện (URL)</span>
          <input className="input mt-2" value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" />
        </label>
        <label className="block">
          <span className="label flex justify-between">Tiểu sử <span>{bio.length}/150</span></span>
          <textarea className="input mt-2 min-h-[96px] resize-none" maxLength={150} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Giới thiệu đôi chút về bạn" />
        </label>
        <Button type="submit" loading={saving} className="w-full">Lưu</Button>
      </form>
    </Modal>
  );
}

export default function Profile() {
  const { username } = useParams();
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
              <h1 className="break-all text-3xl font-extrabold sm:text-5xl">@{user.username}</h1>
              <p className="mt-1 text-paper-dim">{user.bio || (isMe ? 'Thêm tiểu sử để mọi người biết bạn là ai.' : 'Chưa có tiểu sử.')}</p>
            </>
          ) : (
            <><span className="skeleton block h-10 w-56 rounded-xl" /><span className="skeleton mt-3 block h-4 w-72 rounded" /></>
          )}
        </div>
        <div className="flex gap-2 pb-1">
          {isMe && <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil size={16} /> Sửa hồ sơ</button>}
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
          {videos.map((v, i) => <VideoTile key={v._id} video={v} index={i} onDelete={isMe ? remove : undefined} />)}
        </div>
      ) : (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <p className="text-2xl font-extrabold">{isMe ? 'Video đầu tiên của bạn ở đâu?' : 'Chưa có video nào'}</p>
          <p className="mt-2 text-paper-dim">{isMe ? 'Đăng một clip ngắn, AI sẽ lo phần dịch sang 10 ngôn ngữ.' : `@${username} chưa đăng gì.`}</p>
          {isMe && <Link to="/upload" className="btn mt-6"><Plus size={17} /> Tải lên</Link>}
        </div>
      )}

      {isMe && <EditProfile open={editing} onClose={() => setEditing(false)} user={user} onSaved={(u) => { setProfile(u); setUser(u); }} />}
    </div>
  );
}
