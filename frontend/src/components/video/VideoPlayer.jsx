import { useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Clock, Play, VideoOff } from 'lucide-react';
import Spinner from '../common/Spinner';

/** Khi video chưa có nguồn phát: đang xử lý / lỗi / chưa có file */
export function VideoPlaceholder({ video, label }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[#161412] text-white/70">
      {video?.thumbnailUrl && <img src={video.thumbnailUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" onError={(e) => (e.currentTarget.style.display = 'none')} />}
      {label && (
        <span className="relative flex flex-col items-center gap-2 px-6 text-center text-sm font-medium">
          {/xử lý/.test(label) ? <Clock size={28} strokeWidth={1.5} /> : <VideoOff size={28} strokeWidth={1.5} />}
          {label}
        </span>
      )}
    </div>
  );
}

/** Lớp hiển thị video. Trạng thái phát lấy từ useVideoPlayer (gọi ở VideoCard để dùng chung cho phụ đề/lồng tiếng). */
export default function VideoPlayer({ video, player, near }) {
  const { attachRef, barRef, bind, paused, buffering, error, seek } = player;
  const trackRef = useRef(null);
  const playable = video.src && !error;
  const scrub = (e) => {
    const r = trackRef.current.getBoundingClientRect();
    seek((e.clientX - r.left) / r.width);
  };

  return (
    <div className="absolute inset-0 bg-black">
      {playable && near ? (
        <video ref={attachRef} poster={video.thumbnailUrl || undefined} className="absolute inset-0 h-full w-full object-cover" {...bind} />
      ) : (
        <VideoPlaceholder video={video}
          label={error ? 'Không phát được video' : video.status && video.status !== 'ready' ? 'Video đang được xử lý' : !video.src ? 'Chưa có nguồn phát' : ''} />
      )}

      <AnimatePresence>
        {paused && (
          <motion.div className="pointer-events-none absolute inset-0 grid place-items-center"
            initial={{ opacity: 0, scale: 1.2 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <Play size={64} fill="white" strokeWidth={0} className="text-white opacity-80 drop-shadow-lg" />
          </motion.div>
        )}
      </AnimatePresence>
      {buffering && !paused && playable && <div className="pointer-events-none absolute inset-0 grid place-items-center text-white/80"><Spinner size={34} /></div>}

      {playable && (
        <div ref={trackRef} className="group absolute inset-x-0 bottom-0 z-20 flex h-3 cursor-pointer items-end"
          onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); scrub(e); }}
          onPointerMove={(e) => e.buttons && scrub(e)} onClick={(e) => e.stopPropagation()}
          role="slider" aria-label="Tua video" aria-valuemin={0} aria-valuemax={100}>
          <div className="h-[2px] w-full bg-white/25 transition-all duration-150 group-hover:h-1">
            <div ref={barRef} className="h-full w-full origin-left scale-x-0 bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}
