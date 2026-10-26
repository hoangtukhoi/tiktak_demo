import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Play } from 'lucide-react';
import Spinner from '../common/Spinner';

const PALETTES = [
  ['#e4572e', '#f6ae2d', '#1d1a17'], ['#1f3a4d', '#8ecae6', '#ffb703'], ['#3d405b', '#e07a5f', '#f2cc8f'],
  ['#264653', '#e9c46a', '#e76f51'], ['#1d3557', '#a8dadc', '#f1faee'],
];

/** Hình nền chuyển động khi video chưa có nguồn phát (đang transcode / lỗi) */
export function VideoPlaceholder({ seed = '', label }) {
  const [a, b, c] = PALETTES[[...seed].reduce((s, ch) => s + ch.charCodeAt(0), 0) % PALETTES.length];
  return (
    <div className="grain absolute inset-0 overflow-hidden" style={{ background: a }}>
      <svg viewBox="0 0 100 178" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <motion.circle
            key={i} cx="50" cy="80" r={8 + i * 10} fill={i ? 'none' : b} stroke={i % 2 ? b : c} strokeWidth={i % 2 ? 1 : 3}
            animate={{ scale: [1, 1.16, 1] }} transition={{ duration: 3.2, repeat: Infinity, delay: i * -0.4, ease: 'easeInOut' }}
            style={{ transformOrigin: '50px 80px' }}
          />
        ))}
      </svg>
      {label && <span className="absolute inset-x-0 top-1/2 mt-24 text-center font-mono text-xs font-bold uppercase tracking-widest text-white/80">{label}</span>}
    </div>
  );
}

/**
 * Lớp hiển thị video. Trạng thái phát lấy từ useVideoPlayer (gọi ở VideoCard để dùng chung cho phụ đề/lồng tiếng).
 */
export default function VideoPlayer({ video, player, near, showPoster = true }) {
  const { videoRef, barRef, bind, paused, buffering, error, seek } = player;
  const trackRef = useRef(null);
  const playable = video.src && !error;

  const scrub = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    seek((e.clientX - r.left) / r.width);
  };

  return (
    <div className="absolute inset-0 bg-black">
      {showPoster && video.thumbnailUrl && (
        <img src={video.thumbnailUrl} alt="" onError={(e) => (e.currentTarget.style.display = 'none')} className="absolute inset-0 h-full w-full scale-110 object-cover opacity-60 blur-2xl" />
      )}
      {playable && near ? (
        <video ref={videoRef} poster={video.thumbnailUrl || undefined} className="absolute inset-0 h-full w-full object-cover" {...bind} />
      ) : playable && video.thumbnailUrl ? (
        <img src={video.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <VideoPlaceholder
          seed={video._id}
          label={error ? 'Không phát được video' : video.status && video.status !== 'ready' ? 'Video đang được xử lý' : !video.src ? 'Chưa có nguồn phát' : ''}
        />
      )}

      <AnimatePresence>
        {paused && (
          <motion.div
            className="pointer-events-none absolute inset-0 grid place-items-center"
            initial={{ opacity: 0, scale: 1.4 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', damping: 18, stiffness: 300 }}
          >
            <span className="grid h-20 w-20 place-items-center rounded-full bg-black/35 backdrop-blur-md">
              <Play size={34} fill="currentColor" className="ml-1 text-white" />
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      {buffering && !paused && playable && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-white/80"><Spinner size={38} /></div>
      )}

      {playable && (
        <div
          ref={trackRef}
          className="group absolute inset-x-0 bottom-0 z-20 flex h-4 cursor-pointer items-end"
          onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); scrub(e); }}
          onPointerMove={(e) => e.buttons && scrub(e)}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-[3px] w-full bg-white/25 transition-all duration-200 group-hover:h-[6px]">
            <div ref={barRef} className="h-full w-full origin-left scale-x-0 bg-lime" />
          </div>
        </div>
      )}
    </div>
  );
}
