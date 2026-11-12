import { memo, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { BadgeCheck, BarChart3, CalendarClock, Eye, FileText, Flag, Heart, Lock, Music2, Pin, PinOff, Repeat2, Users, X } from 'lucide-react';
import VideoPlayer, { VideoPlaceholder } from './VideoPlayer';
import ActionButtons from './ActionButtons';
import ShareSheet from './ShareSheet';
import CommentList from '../comment/CommentList';
import LanguageSelector from '../dubbing/LanguageSelector';
import Modal from '../common/Modal';
import Avatar from '../common/Avatar';
import RichText from '../common/RichText';
import VolumeControl from './VolumeControl';
import useVideoPlayer from '../../hooks/useVideoPlayer';
import useAuth from '../../hooks/useAuth';
import useVideoStore from '../../store/slices/videoSlice';
import { likeVideo, recordView, saveVideo, shareVideo, toggleRepost } from '../../api/video.api';
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

/** "@a, @b và 3 người khác đã đăng lại" — góc dưới bên trái video (người mình theo dõi) */
function RepostedBy({ users, total, self }) {
  const avatars = users.slice(0, 2);
  // 2 người → ghi đủ 2 tên; nhiều hơn → "@a và N người khác" cho gọn 1 dòng
  const names = users.slice(0, total === 2 ? 2 : 1);
  const rest = Math.max(0, total - names.length);
  return (
    <motion.p initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="mb-2 flex w-fit max-w-full items-center gap-1.5 rounded-full bg-black/45 py-1 pl-1 pr-3 text-[13px] font-semibold backdrop-blur-md">
      <span className="flex -space-x-1.5">
        {avatars.length ? avatars.map((u) => <Avatar key={u._id} user={u} size={20} className="rounded-full ring-2 ring-black/40" />) : (
          <span className="grid h-5 w-5 place-items-center rounded-full bg-brand text-white"><Repeat2 size={12} strokeWidth={2.6} /></span>
        )}
      </span>
      <Repeat2 size={14} className="shrink-0" />
      <span className="truncate">
        {self && !names.length ? 'Bạn đã đăng lại' : (
          <>
            {names.map((u, i) => (
              <span key={u._id}>
                {i > 0 && (i === names.length - 1 && !rest ? ' và ' : ', ')}
                <Link to={`/profile/${u.username}`} onClick={(e) => e.stopPropagation()} className="hover:underline">{u.username}</Link>
              </span>
            ))}
            {rest > 0 && ` và ${rest} người khác`}
            {self && ' (cả bạn)'} đã đăng lại
          </>
        )}
      </span>
    </motion.p>
  );
}

/** source: nơi xem (for_you | following | profile | search | direct) — dùng cho trang Phân tích */
function VideoCard({ video: initial, active, near = true, layout = 'feed', onCommentsInline, source = 'direct' }) {
  const [video, setVideo] = useState(initial);
  const [hearts, setHearts] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [sheet, setSheet] = useState(null); // comments | dub | share
  const [dub, setDub] = useState(null);     // AudioTrack đang dùng
  const { user: me, isAdmin, isStaff, requireAuth } = useAuth();
  const isOwn = !!me?._id && me._id === video.author._id;
  const { isMuted, volume } = useVideoStore();
  const player = useVideoPlayer(video.src, active, { forceMute: !!dub?.audioUrl });
  const audioRef = useRef(null);
  const tapTimer = useRef(null);

  useEffect(() => setVideo(initial), [initial]);

  // ── Đo thời gian xem thật (chỉ tính lúc video đang phát) ──
  // Gửi 1 lượt xem khi rời video (vuốt qua, chuyển trang, đóng tab) nếu đã xem ≥ 1 giây.
  const watch = useRef({ ms: 0, last: null, looped: false });
  useEffect(() => {
    const w = watch.current;
    if (!active || !player.playing) { w.last = null; return; }
    const t = player.time;
    if (w.last !== null) {
      const dt = t - w.last;
      if (dt > 0 && dt < 1.5) w.ms += dt * 1000; // bỏ qua bước nhảy do tua
      else if (dt < 0 && player.duration && w.last > player.duration - 1.5) w.looped = true; // phát lại từ đầu
    }
    w.last = t;
  }, [player.time, player.playing, active, player.duration]);

  useEffect(() => {
    if (!active || !video.src) return undefined;
    watch.current = { ms: 0, last: null, looped: false };
    let sent = false;
    const flush = () => {
      if (sent) return;
      const { ms, looped } = watch.current;
      if (ms < 1000) return;
      sent = true;
      const durationMs = Math.round((player.videoRef.current?.duration || 0) * 1000);
      recordView(video._id, {
        watchTimeMs: Math.round(ms), durationMs,
        completed: looped || (durationMs > 0 && ms >= durationMs * 0.9), source,
      }).catch(() => {});
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, video._id, video.src, source]);

  // Đồng bộ audio lồng tiếng với video (video tắt tiếng khi có audioUrl)
  useEffect(() => {
    const a = audioRef.current, v = player.videoRef.current;
    if (!a || !v) return;
    a.muted = isMuted;
    a.volume = volume;
    if (player.playing && active) {
      if (Math.abs(a.currentTime - v.currentTime) > 0.35) a.currentTime = v.currentTime;
      a.play().catch(() => {});
    } else a.pause();
  }, [player.playing, player.time, active, isMuted, volume, dub]);

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
  const save = () => optimistic('Đăng nhập để lưu video', (v) => ({ isSaved: !v.isSaved, saveCount: Math.max(0, v.saveCount + (v.isSaved ? -1 : 1)) }), () => saveVideo(video._id),
    (r, v) => (typeof r.isSaved === 'boolean' ? { isSaved: r.isSaved, saveCount: r.saveCount ?? v.saveCount } : {}));
  // Đăng lại (từ bảng Chia sẻ). Không đăng lại video của mình; admin không dùng.
  const repost = () => {
    setSheet(null);
    optimistic('Đăng nhập để đăng lại video', (v) => ({ isReposted: !v.isReposted, repostCount: Math.max(0, v.repostCount + (v.isReposted ? -1 : 1)) }),
      () => toggleRepost(video._id), (r) => {
        toast(r.reposted ? 'Đã đăng lại — người theo dõi bạn sẽ thấy video này' : 'Đã huỷ đăng lại');
        return { isReposted: r.reposted, repostCount: r.repostCount };
      });
  };
  const canRepost = !isOwn && !isAdmin && (video.canRepost || video.isReposted);
  const canReport = !isOwn && !isStaff; // admin / kiểm duyệt viên đã có công cụ kiểm duyệt
  const [reporting, setReporting] = useState(false);
  // Mỗi tài khoản chỉ được tính 1 lượt chia sẻ / video → không tự cộng, lấy đúng số từ server
  const onShared = (method) => shareVideo(video._id, method)
    .then((r) => typeof r?.shareCount === 'number' && setVideo((v) => ({ ...v, shareCount: r.shareCount })))
    .catch(() => {});
  const follow = () => {
    const on = !video.author.isFollowing;
    optimistic('Đăng nhập để theo dõi', (v) => ({ author: { ...v.author, isFollowing: on } }), () => (on ? followUser : unfollowUser)(video.author._id), () => ({}));
  };

  const onTap = (e) => {
    if (e.target.closest('a,button,[role=slider],[data-no-tap]')) return;
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
  // Admin không có mục "Đã lưu" / không theo dõi → ẩn 2 nút đó
  const actions = { video, onLike: () => like(), onComment: openComments, onSave: isAdmin ? undefined : save, onShare: () => setSheet('share'), onDub: () => setSheet('dub'), onFollow: isAdmin ? undefined : follow, dubLang: dub?.targetLang };

  return (
    <article className={`relative flex h-full w-full items-end justify-center gap-4 ${layout === 'feed' ? 'lg:px-6 lg:py-5' : 'lg:py-5'}`} data-id={video._id}>
      <div onClick={onTap} className="relative h-full w-full select-none overflow-hidden bg-black lg:aspect-[9/16] lg:w-auto lg:max-w-full lg:rounded-xl">
        <VideoPlayer video={video} player={player} near={near} />
        {dub?.audioUrl && <audio ref={audioRef} src={dub.audioUrl} preload="auto" />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />

        <div className={`absolute right-3 z-10 flex flex-col items-end gap-2 ${layout === 'feed' ? 'top-14 lg:top-3' : 'top-3'}`}>
          <VolumeControl />
          {canReport && (
            // Trên điện thoại báo cáo nằm trong bảng Chia sẻ
            <button onClick={() => requireAuth('Đăng nhập để báo cáo') && setReporting(true)} aria-label="Báo cáo video" title="Báo cáo video"
              className="hidden h-9 w-9 place-items-center rounded-full bg-black/40 text-white transition-colors hover:bg-black/60 lg:grid">
              <Flag size={16} />
            </button>
          )}
        </div>

        {hearts.map((h) => <HeartPop key={h.id} x={h.x} y={h.y} />)}

        <AnimatePresence>
          {dub?.translatedText && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-3 bottom-[168px] z-10">
              <Subtitles text={dub.translatedText} frac={frac} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-4 left-4 right-20 z-10 text-white lg:right-4">
          {(video.repostedBy.length > 0 || video.isReposted) && (
            <RepostedBy users={video.repostedBy} total={video.repostedByCount} self={video.isReposted} />
          )}
          <Link to={`/profile/${video.author.username}`} className="text-shadow inline-flex items-center gap-1 text-base font-bold hover:underline">
            {video.author.username}
            {video.author.isVerified && <BadgeCheck size={15} className="text-white" />}
            <span className="ml-1 text-sm font-normal text-white/75">· {timeAgo(video.createdAt)}</span>
          </Link>
          {caption && (
            <p className="text-shadow mt-1 text-sm leading-snug">
              <span className={expanded ? '' : 'line-clamp-2'}><RichText text={caption} mentions={video.mentions} linkClassName="font-semibold text-white hover:underline" /></span>
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
          <CommentList videoId={video._id} videoOwnerId={video.author._id} allowComment={video.allowComment !== false} policy={video.commentPolicy}
            onCountChange={(d) => setVideo((v) => ({ ...v, commentCount: Math.max(0, v.commentCount + d) }))} />
        </Modal>
      )}
      <ShareSheet video={video} open={sheet === 'share'} onClose={() => setSheet(null)} onShared={onShared}
        onRepost={canRepost ? repost : undefined} canReport={canReport} reportOpen={reporting} onReportOpen={setReporting} />
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
export function VideoTile({ video, index = 0, onDelete, onPin, from }) {
  const [hover, setHover] = useState(false);
  const navigate = useNavigate();
  const ready = !video.status || video.status === 'ready';
  const badge = video.isDraft ? 'draft' : !ready ? 'processing' : video.scheduledAt && new Date(video.scheduledAt) > new Date() ? 'scheduled'
    : video.moderationStatus === 'flagged' ? 'flagged' : video.visibility !== 'public' ? video.visibility : null;
  const [Icon, label] = BADGE[badge] || [];
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(index, 12) * 0.03, duration: 0.2 }}>
      <Link to={`/watch/${video._id}`} state={from ? { from } : undefined} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        className="group relative block aspect-[3/4] overflow-hidden rounded-md bg-surface-2">
        <VideoPlaceholder video={video} />
        {hover && ready && video.src && !video.src.includes('.m3u8') && (
          <video src={video.src} muted autoPlay loop playsInline className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 to-transparent" />
        <span className="tabular absolute bottom-2 left-2.5 inline-flex items-center gap-1 text-xs font-semibold text-white"><Eye size={14} /> {formatCount(video.viewCount)}</span>
        {!label && ready && video.pinnedAt && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-brand px-1.5 py-0.5 text-2xs font-semibold text-white">
            <Pin size={11} fill="currentColor" /> Đã ghim
          </span>
        )}
        {label && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-2xs font-semibold text-white">
            {Icon && <Icon size={12} />} {label}
          </span>
        )}
        {(onDelete || onPin) && (
          <span className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
            {onDelete && ready && !video.isDraft && (
              <button onClick={(e) => { e.preventDefault(); navigate(`/analytics/video/${video._id}`); }} aria-label="Phân tích video" title="Phân tích"
                className="grid h-6 w-6 place-items-center rounded bg-black/60 text-white hover:bg-black/80"><BarChart3 size={13} /></button>
            )}
            {onPin && ready && !video.isDraft && (
              <button onClick={(e) => { e.preventDefault(); onPin(video); }} aria-label={video.pinnedAt ? 'Bỏ ghim video' : 'Ghim video lên đầu hồ sơ'} title={video.pinnedAt ? 'Bỏ ghim' : 'Ghim lên đầu hồ sơ'}
                className="grid h-6 w-6 place-items-center rounded bg-black/60 text-white hover:bg-black/80">{video.pinnedAt ? <PinOff size={13} /> : <Pin size={13} />}</button>
            )}
            {onDelete && (
              <button onClick={(e) => { e.preventDefault(); onDelete(video); }}
                className="rounded bg-black/60 px-2 py-0.5 text-2xs font-semibold text-white hover:bg-danger">Xoá</button>
            )}
          </span>
        )}
      </Link>
      <p className="mt-1.5 line-clamp-1 text-sm text-fg">{video.title}</p>
    </motion.div>
  );
}
