import { memo, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { BadgeCheck, CalendarClock, Eye, FileText, Heart, Lock, Music2, Users, Volume2, VolumeX, X } from 'lucide-react';
import VideoPlayer, { VideoPlaceholder } from './VideoPlayer';
import ActionButtons from './ActionButtons';
import ShareSheet from './ShareSheet';
import CommentList from '../comment/CommentList';
import LanguageSelector from '../dubbing/LanguageSelector';
import Modal from '../common/Modal';
import useVideoPlayer from '../../hooks/useVideoPlayer';
import useAuth from '../../hooks/useAuth';
import useVideoStore from '../../store/slices/videoSlice';
import { likeVideo, recordView, saveVideo } from '../../api/video.api';
import { followUser, unfollowUser } from '../../api/auth.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount, timeAgo } from '../../utils/format';

function HeartPop({ x, y }) {
  return (
    <motion.div className="pointer-events-none absolute z-30" style={{ left: x - 44, top: y - 44 }}
      initial={{ scale: 0.4, opacity: 0, rotate: -12 }} animate={{ scale: [0.4, 1.15, 1], opacity: [0, 1, 0], y: [0, -6, -48], rotate: [-12, 6, 0] }}
      transition={{ duration: 0.8, times: [0, 0.35, 1] }}>
      <Heart size={88} className="text-[#FF3B4E] drop-shadow-[0_6px_18px_rgba(0,0,0,.35)]" fill="currentColor" strokeWidth={0} />
    </motion.div>
  );
}

/** Phụ đề AI: từ đang đọc rõ nét, các từ khác mờ hơn */
function Subtitles({ text, frac }) {
  const words = text.split(/\s+/);
  const k = Math.min(words.length - 1, Math.floor(frac * words.length));
  return (
    <p className="text-shadow mx-auto max-w-[92%] text-center text-md font-semibold leading-snug text-white">
      <span className="rounded bg-black/55 px-1.5 py-0.5 [box-decoration-break:clone]">
        {words.map((w, i) => <span key={i} className={i <= k ? 'text-white' : 'text-white/55'}>{w}{' '}</span>)}
      </span>
    </p>
  );
}

function VideoCard({ video: initial, active, near = true, layout = 'feed', onCommentsInline }) {
  const [video, setVideo] = useState(initial);
  const [hearts, setHearts] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [sheet, setSheet] = useState(null); // comments | dub | share
  const [dub, setDub] = useState(null);     // AudioTrack đang dùng
  const { requireAuth } = useAuth();
  const { isMuted, toggleMute } = useVideoStore();
  const player = useVideoPlayer(video.src, active, { forceMute: !!dub?.audioUrl });
  const audioRef = useRef(null);
  const tapTimer = useRef(null);

  useEffect(() => setVideo(initial), [initial]);

  useEffect(() => {
    if (!active || !video.src) return;
    const t = setTimeout(() => recordView(video._id, 2000).catch(() => {}), 2000);
    return () => clearTimeout(t);
  }, [active, video._id, video.src]);

  // Đồng bộ audio lồng tiếng với video (video tắt tiếng khi có audioUrl)
  useEffect(() => {
    const a = audioRef.current, v = player.videoRef.current;
    if (!a || !v) return;
    a.muted = isMuted;
    if (player.playing && active) {
      if (Math.abs(a.currentTime - v.currentTime) > 0.35) a.currentTime = v.currentTime;
      a.play().catch(() => {});
    } else a.pause();
  }, [player.playing, player.time, active, isMuted, dub]);

  /** Cập nhật lạc quan rồi đồng bộ với kết quả server; lỗi thì trả lại như cũ */
  const optimistic = async (msg, patch, call, apply) => {
    if (!requireAuth(msg)) return;
    const prev = video;
    setVideo((v) => ({ ...v, ...patch(v) }));
    try { const r = await call(); if (r) setVideo((v) => ({ ...v, ...apply(r, v) })); }
    catch (e) { setVideo(prev); toast.error(errMsg(e)); }
  };
  const like = (fromTap = false) => {
    if (fromTap && video.isLiked) return requireAuth('Đăng nhập để thả tim');
    optimistic('Đăng nhập để thả tim', (v) => ({ isLiked: !v.isLiked, likeCount: v.likeCount + (v.isLiked ? -1 : 1) }), () => likeVideo(video._id),
      (r, v) => (typeof r.isLiked === 'boolean' ? { isLiked: r.isLiked, likeCount: r.likeCount ?? v.likeCount } : {}));
  };
  const save = () => optimistic('Đăng nhập để lưu video', (v) => ({ isSaved: !v.isSaved, saveCount: v.saveCount + (v.isSaved ? -1 : 1) }), () => saveVideo(video._id),
    (r, v) => (typeof r.isSaved === 'boolean' ? { isSaved: r.isSaved, saveCount: r.saveCount ?? v.saveCount } : {}));
  const follow = () => {
    const on = !video.author.isFollowing;
    optimistic('Đăng nhập để theo dõi', (v) => ({ author: { ...v.author, isFollowing: on } }), () => (on ? followUser : unfollowUser)(video.author._id), () => ({}));
  };

  const onTap = (e) => {
    if (e.target.closest('a,button,[role=slider]')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pos = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (tapTimer.current) {
      clearTimeout(tapTimer.current); tapTimer.current = null;
      const id = Date.now();
      setHearts((h) => [...h, { id, ...pos }]);
      setTimeout(() => setHearts((h) => h.filter((x) => x.id !== id)), 850);
      like(true);
    } else tapTimer.current = setTimeout(() => { tapTimer.current = null; player.toggle(); }, 240);
  };

  const openComments = () => (onCommentsInline ? onCommentsInline() : setSheet('comments'));
  const frac = player.duration ? player.time / player.duration : 0;
  const caption = [video.title, video.description].filter(Boolean).join(' — ');
  const actions = { video, onLike: () => like(), onComment: openComments, onSave: save, onShare: () => setSheet('share'), onDub: () => setSheet('dub'), onFollow: follow, dubLang: dub?.targetLang };

  return (
    <article className={`relative flex h-full w-full items-end justify-center gap-4 ${layout === 'feed' ? 'lg:px-6 lg:py-5' : 'lg:py-5'}`} data-id={video._id}>
      <div onClick={onTap} className="relative h-full w-full select-none overflow-hidden bg-black lg:aspect-[9/16] lg:w-auto lg:max-w-full lg:rounded-xl">
        <VideoPlayer video={video} player={player} near={near} />
        {dub?.audioUrl && <audio ref={audioRef} src={dub.audioUrl} preload="auto" />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />

        <button onClick={toggleMute} aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
          className={`absolute right-3 z-10 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 ${layout === 'feed' ? 'top-14 lg:top-3' : 'top-3'}`}>
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        </button>

        {hearts.map((h) => <HeartPop key={h.id} x={h.x} y={h.y} />)}

        <AnimatePresence>
          {dub?.translatedText && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-3 bottom-[168px] z-10">
              <Subtitles text={dub.translatedText} frac={frac} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-4 left-4 right-20 z-10 text-white lg:right-4">
          <Link to={`/profile/${video.author.username}`} className="text-shadow inline-flex items-center gap-1 text-base font-bold hover:underline">
            {video.author.username}
            {video.author.isVerified && <BadgeCheck size={15} className="text-white" />}
            <span className="ml-1 text-sm font-normal text-white/75">· {timeAgo(video.createdAt)}</span>
          </Link>
          {caption && (
            <p className="text-shadow mt-1 text-sm leading-snug">
              <span className={expanded ? '' : 'line-clamp-2'}>{caption}</span>
              {caption.length > 90 && <button onClick={() => setExpanded((x) => !x)} className="font-semibold">{expanded ? 'ẩn bớt' : 'thêm'}</button>}
            </p>
          )}
          {video.hashtags.length > 0 && (
            <p className="text-shadow mt-0.5 flex flex-wrap gap-x-2 text-sm font-semibold">
              {video.hashtags.slice(0, 5).map((t) => <Link key={t} to={`/search?q=%23${t}`} className="hover:underline">#{t}</Link>)}
            </p>
          )}
          <p className="text-shadow mt-2.5 flex items-center gap-1.5 text-sm">
            <Music2 size={14} className="shrink-0" />
            <span className="truncate">{dub ? `Lồng tiếng AI · ${dub.targetLang.toUpperCase()}` : `Âm thanh gốc · ${video.author.username}`}</span>
            {dub && (
              <button onClick={() => setDub(null)} className="ml-1 inline-flex shrink-0 items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold hover:bg-white/30" aria-label="Tắt lồng tiếng">
                Âm gốc <X size={12} />
              </button>
            )}
          </p>
        </div>

        <div className="absolute bottom-20 right-1.5 z-10 lg:hidden"><ActionButtons overlay {...actions} /></div>
      </div>

      <div className="hidden pb-1 lg:block"><ActionButtons {...actions} /></div>

      {!onCommentsInline && (
        <Modal open={sheet === 'comments'} onClose={() => setSheet(null)} title={`Bình luận (${formatCount(video.commentCount)})`} variant="drawer">
          <CommentList videoId={video._id} allowComment={video.allowComment !== false}
            onCountChange={(d) => setVideo((v) => ({ ...v, commentCount: Math.max(0, v.commentCount + d) }))} />
        </Modal>
      )}
      <ShareSheet video={video} open={sheet === 'share'} onClose={() => setSheet(null)} onShared={() => setVideo((v) => ({ ...v, shareCount: v.shareCount + 1 }))} />
      <LanguageSelector video={video} open={sheet === 'dub'} onClose={() => setSheet(null)} current={dub?.targetLang} onSelect={setDub} requireAuth={requireAuth} />
    </article>
  );
}

export default memo(VideoCard);

const BADGE = {
  draft: [FileText, 'Bản nháp'], processing: [null, 'Đang xử lý'], scheduled: [CalendarClock, 'Đã lên lịch'],
  private: [Lock, 'Riêng tư'], friends: [Users, 'Bạn bè'], flagged: [null, 'Chờ duyệt'],
};

/** Ô video dạng lưới (Hồ sơ, Khám phá). Rê chuột để xem trước. */
export function VideoTile({ video, index = 0, onDelete }) {
  const [hover, setHover] = useState(false);
  const ready = !video.status || video.status === 'ready';
  const badge = video.isDraft ? 'draft' : !ready ? 'processing' : video.scheduledAt && new Date(video.scheduledAt) > new Date() ? 'scheduled'
    : video.moderationStatus === 'flagged' ? 'flagged' : video.visibility !== 'public' ? video.visibility : null;
  const [Icon, label] = BADGE[badge] || [];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(index, 12) * 0.03, duration: 0.2 }}>
      <Link to={`/watch/${video._id}`} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        className="group relative block aspect-[3/4] overflow-hidden rounded-md bg-surface-2">
        <VideoPlaceholder video={video} />
        {hover && ready && video.src && !video.src.includes('.m3u8') && (
          <video src={video.src} muted autoPlay loop playsInline className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
        <span className="tabular absolute bottom-2 left-2.5 inline-flex items-center gap-1 text-xs font-semibold text-white"><Eye size={14} /> {formatCount(video.viewCount)}</span>
        {label && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-2xs font-semibold text-white">
            {Icon && <Icon size={12} />} {label}
          </span>
        )}
        {onDelete && (
          <button onClick={(e) => { e.preventDefault(); onDelete(video); }}
            className="absolute right-2 top-2 rounded bg-black/60 px-2 py-0.5 text-2xs font-semibold text-white opacity-0 transition hover:bg-danger group-hover:opacity-100 focus:opacity-100">
            Xoá
          </button>
        )}
      </Link>
      <p className="mt-1.5 line-clamp-1 text-sm text-fg">{video.title}</p>
    </motion.div>
  );
}
