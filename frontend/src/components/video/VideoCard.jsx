import { memo, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { BadgeCheck, Heart, Music2, Volume2, VolumeX } from 'lucide-react';
import VideoPlayer, { VideoPlaceholder } from './VideoPlayer';
import ActionButtons from './ActionButtons';
import CommentList from '../comment/CommentList';
import LanguageSelector from '../dubbing/LanguageSelector';
import Modal from '../common/Modal';
import useVideoPlayer from '../../hooks/useVideoPlayer';
import useAuth from '../../hooks/useAuth';
import useVideoStore from '../../store/slices/videoSlice';
import { likeVideo, recordView } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';
import { formatCount, timeAgo } from '../../utils/format';

function HeartBurst({ x, y }) {
  return (
    <motion.div className="pointer-events-none absolute z-30" style={{ left: x, top: y }}
      initial={{ scale: 0.3, opacity: 0, rotate: -15 }} animate={{ scale: [0.3, 1.2, 1], opacity: [0, 1, 1, 0], y: [0, 0, -40], rotate: [-15, 8, 0] }}
      transition={{ duration: 0.9, times: [0, 0.3, 1] }}>
      <Heart size={96} className="-ml-12 -mt-12 text-coral drop-shadow-[0_8px_24px_rgba(255,90,71,.5)]" fill="currentColor" strokeWidth={0} />
      {Array.from({ length: 8 }, (_, i) => (
        <motion.span key={i} className="absolute left-0 top-0 h-2 w-2 rounded-full bg-lime"
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: Math.cos((i * Math.PI) / 4) * 80, y: Math.sin((i * Math.PI) / 4) * 80, opacity: 0, scale: 0.2 }}
          transition={{ duration: 0.7, ease: 'easeOut' }} />
      ))}
    </motion.div>
  );
}

/** Phụ đề kiểu karaoke từ AudioTrack.translatedText, chạy theo tiến độ video */
function Subtitles({ text, frac }) {
  const words = text.split(/\s+/);
  const k = Math.min(words.length - 1, Math.floor(frac * words.length));
  return (
    <p className="text-shadow text-[22px] font-extrabold leading-tight tracking-tight sm:text-2xl">
      {words.map((w, i) => (
        <span key={i} className={`mr-[0.25em] inline-block transition-all duration-200 ${i === k ? '-translate-y-0.5 text-lime' : i < k ? 'text-white' : 'text-white/45'}`}>{w}</span>
      ))}
    </p>
  );
}

function VideoCard({ video: initial, active, near = true, layout = 'feed', onCommentsInline }) {
  const [video, setVideo] = useState(initial);
  const [bursts, setBursts] = useState([]);
  const [expanded, setExpanded] = useState(false);
  const [sheet, setSheet] = useState(null); // 'comments' | 'dub'
  const [dub, setDub] = useState(null); // AudioTrack đang dùng
  const { requireAuth } = useAuth();
  const { isMuted, toggleMute } = useVideoStore();
  const player = useVideoPlayer(video.src, active, { forceMute: !!dub?.audioUrl });
  const audioRef = useRef(null);
  const tapTimer = useRef(null);

  useEffect(() => setVideo(initial), [initial]);

  // Ghi nhận lượt xem sau 2 giây
  useEffect(() => {
    if (!active || !video.src) return;
    const t = setTimeout(() => recordView(video._id, 2000).catch(() => {}), 2000);
    return () => clearTimeout(t);
  }, [active, video._id, video.src]);

  // Đồng bộ audio lồng tiếng với video (video bị tắt tiếng khi có audioUrl)
  useEffect(() => {
    const a = audioRef.current;
    const v = player.videoRef.current;
    if (!a || !v) return;
    a.muted = isMuted;
    if (player.playing && active) {
      if (Math.abs(a.currentTime - v.currentTime) > 0.35) a.currentTime = v.currentTime;
      a.play().catch(() => {});
    } else a.pause();
  }, [player.playing, player.time, active, isMuted, dub]);

  const like = async (fromDoubleTap = false) => {
    if (!requireAuth('Đăng nhập để thả tim')) return;
    if (fromDoubleTap && video.isLiked) return;
    const prev = video;
    setVideo((v) => ({ ...v, isLiked: !v.isLiked, likeCount: v.likeCount + (v.isLiked ? -1 : 1) }));
    try {
      const r = await likeVideo(video._id);
      if (r && typeof r.isLiked === 'boolean') setVideo((v) => ({ ...v, isLiked: r.isLiked, likeCount: r.likeCount ?? v.likeCount }));
    } catch (e) {
      setVideo(prev);
      toast.error(errMsg(e));
    }
  };

  const share = async () => {
    const url = `${location.origin}/watch/${video._id}`;
    try {
      if (navigator.share) await navigator.share({ title: video.title, url });
      else { await navigator.clipboard.writeText(url); toast('Đã sao chép liên kết', { icon: '🔗' }); }
      setVideo((v) => ({ ...v, shareCount: v.shareCount + 1 }));
    } catch { /* người dùng huỷ */ }
  };

  const onTap = (e) => {
    if (e.target.closest('a,button')) return;
    const r = e.currentTarget.getBoundingClientRect();
    const pos = { x: e.clientX - r.left, y: e.clientY - r.top };
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      const id = Date.now();
      setBursts((b) => [...b, { id, ...pos }]);
      setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 950);
      like(true);
    } else {
      tapTimer.current = setTimeout(() => { tapTimer.current = null; player.toggle(); }, 240);
    }
  };

  const openComments = () => (onCommentsInline ? onCommentsInline() : setSheet('comments'));
  const frac = player.duration ? player.time / player.duration : 0;
  const caption = [video.title, video.description].filter(Boolean).join(' — ');

  return (
    <article className={`relative flex h-full w-full snap-start snap-always items-center justify-center gap-5 ${layout === 'feed' ? 'sm:py-4' : ''}`} data-id={video._id}>
      <div
        onClick={onTap}
        className="relative h-full w-full select-none overflow-hidden bg-black sm:aspect-[9/16] sm:w-auto sm:max-w-full sm:rounded-[28px] sm:shadow-[0_30px_80px_-20px_rgba(0,0,0,.8)]"
      >
        <VideoPlayer video={video} player={player} near={near} />
        {dub?.audioUrl && <audio ref={audioRef} src={dub.audioUrl} preload="auto" />}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/50 to-transparent" />

        {/* góc trên */}
        <div className={`absolute right-3 z-10 ${layout === 'feed' ? 'top-14 sm:top-16' : 'top-3'}`}>
          <button onClick={toggleMute} className="grid h-9 w-9 place-items-center rounded-full bg-black/35 text-white backdrop-blur-md transition hover:bg-black/55" aria-label={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}>
            {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
        </div>

        {bursts.map((b) => <HeartBurst key={b.id} x={b.x} y={b.y} />)}

        {/* phụ đề lồng tiếng */}
        <AnimatePresence>
          {dub?.translatedText && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-x-4 bottom-[200px] z-10 sm:right-4">
              <Subtitles text={dub.translatedText} frac={frac} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* thông tin */}
        <div className="absolute bottom-5 left-4 right-20 z-10 text-white sm:right-4">
          <Link to={`/profile/${video.author.username}`} className="inline-flex items-center gap-1.5 text-[17px] font-extrabold hover:underline">
            @{video.author.username}
            {video.author.isVerified && <BadgeCheck size={16} className="text-lime" />}
            <span className="ml-1 font-mono text-[11px] font-medium text-white/60">· {timeAgo(video.createdAt)} · {formatCount(video.viewCount)} lượt xem</span>
          </Link>
          <p className={`mt-1.5 text-[15px] leading-snug ${expanded ? '' : 'line-clamp-2'}`} onClick={() => setExpanded((x) => !x)}>
            {caption}
          </p>
          {video.hashtags.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-x-2.5 font-mono text-[12px] font-bold text-white/85">
              {video.hashtags.slice(0, 5).map((t) => <Link key={t} to={`/search?q=%23${t}`} className="hover:text-lime">#{t}</Link>)}
            </p>
          )}
          <div className="mt-3 flex items-center gap-2 overflow-hidden">
            <Music2 size={14} className="shrink-0" />
            <div className="w-44 overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
              <p className="flex w-max animate-marquee gap-8 whitespace-nowrap text-[13px]">
                {[0, 1].map((i) => <span key={i}>{dub ? `Lồng tiếng AI · ${dub.targetLang.toUpperCase()}` : `Âm thanh gốc · @${video.author.username}`}</span>)}
              </p>
            </div>
            {dub && (
              <button onClick={() => setDub(null)} className="pointer-events-auto rounded-full bg-lime px-2.5 py-0.5 font-mono text-[11px] font-bold text-ink">
                {dub.targetLang.toUpperCase()} ✕
              </button>
            )}
          </div>
        </div>

        {/* thanh hành động trên mobile */}
        <div className="absolute bottom-24 right-2 z-10 sm:hidden">
          <ActionButtons video={video} onLike={() => like()} onComment={openComments} onDub={() => setSheet('dub')} onShare={share} dubLang={dub?.targetLang} />
        </div>
      </div>

      {/* thanh hành động desktop, đặt cạnh khung video */}
      <div className="hidden self-end pb-6 sm:block">
        <ActionButtons video={video} onLike={() => like()} onComment={openComments} onDub={() => setSheet('dub')} onShare={share} dubLang={dub?.targetLang} />
      </div>

      {!onCommentsInline && (
        <Modal open={sheet === 'comments'} onClose={() => setSheet(null)} title={`${formatCount(video.commentCount)} bình luận`}>
          <CommentList videoId={video._id} allowComment={video.allowComment !== false}
            onCountChange={(d) => setVideo((v) => ({ ...v, commentCount: Math.max(0, v.commentCount + d) }))} />
        </Modal>
      )}
      <LanguageSelector video={video} open={sheet === 'dub'} onClose={() => setSheet(null)} current={dub?.targetLang} onSelect={setDub} requireAuth={requireAuth} />
    </article>
  );
}

export default memo(VideoCard);

/** Ô video dạng lưới (Profile, Search): rê chuột để xem trước, `index` dùng cho hiệu ứng xuất hiện so le */
export function VideoTile({ video, index = 0, onDelete }) {
  const [hover, setHover] = useState(false);
  const ready = !video.status || video.status === 'ready';
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index, 12) * 0.04, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}>
      <Link
        to={`/watch/${video._id}`}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
        className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-ink-700 transition duration-500 ease-out hover:-translate-y-1 hover:-rotate-[0.6deg]"
      >
        <VideoPlaceholder seed={video._id} />
        {video.thumbnailUrl && (
          <img src={video.thumbnailUrl} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
        )}
        {hover && ready && video.src && !video.src.includes('.m3u8') && (
          <video src={video.src} muted autoPlay loop playsInline className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent" />
        <span className="absolute bottom-2.5 left-3 font-mono text-xs font-bold text-white">▶ {formatCount(video.viewCount)}</span>
        {!ready && <span className="absolute left-2.5 top-2.5 rounded-full bg-lime px-2 py-0.5 font-mono text-[10px] font-bold text-ink">ĐANG XỬ LÝ</span>}
        <p className="absolute inset-x-3 bottom-8 line-clamp-2 text-sm font-semibold text-white opacity-0 transition duration-300 group-hover:opacity-100">{video.title}</p>
        {onDelete && (
          <button
            onClick={(e) => { e.preventDefault(); onDelete(video); }}
            className="absolute right-2 top-2 rounded-full bg-black/50 px-2.5 py-1 text-xs font-bold text-white opacity-0 backdrop-blur transition hover:bg-coral group-hover:opacity-100"
          >
            Xoá
          </button>
        )}
      </Link>
    </motion.div>
  );
}
