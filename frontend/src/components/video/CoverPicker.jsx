import { useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';

const STRIP = 8;

/** Seek tới thời điểm t của <video> rồi vẽ vào canvas (cao tối đa h px) */
async function frameAt(video, t, h) {
  await new Promise((res) => { video.onseeked = res; video.currentTime = Math.min(t, Math.max(0, video.duration - 0.05)); });
  const s = Math.min(1, h / video.videoHeight);
  const c = document.createElement('canvas');
  c.width = Math.round(video.videoWidth * s); c.height = Math.round(video.videoHeight * s);
  c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
  return c;
}

/**
 * Chọn ảnh bìa: dải 8 khung hình + thanh trượt chọn chính xác, hoặc tải ảnh riêng.
 * onChange({ blob, url, time }) — blob JPEG gửi lên server ở field `thumbnail`.
 */
export default function CoverPicker({ src, duration, onChange }) {
  const vref = useRef(null);
  const [strip, setStrip] = useState([]);
  const [t, setT] = useState(0);
  const [custom, setCustom] = useState(null);
  const busy = useRef(Promise.resolve());

  // Thao tác seek phải tuần tự trên cùng 1 <video>
  const queue = (fn) => (busy.current = busy.current.then(fn, fn));

  useEffect(() => {
    if (!src || !duration) return;
    const v = vref.current;
    let alive = true;
    const run = () => queue(async () => {
      const frames = [];
      for (let i = 0; i < STRIP; i++) frames.push((await frameAt(v, (duration * (i + 0.5)) / STRIP, 120)).toDataURL('image/jpeg', 0.7));
      if (alive) setStrip(frames);
    });
    v.readyState >= 1 ? run() : v.addEventListener('loadeddata', run, { once: true });
    return () => { alive = false; };
  }, [src, duration]); // eslint-disable-line react-hooks/exhaustive-deps

  // Chụp khung đã chọn ở độ phân giải đầy đủ (debounce khi kéo)
  useEffect(() => {
    if (!src || !duration || custom) return;
    const id = setTimeout(() => queue(async () => {
      const c = await frameAt(vref.current, t, 1280);
      c.toBlob((blob) => blob && onChange({ blob, url: URL.createObjectURL(blob), time: t }), 'image/jpeg', 0.88);
    }), 180);
    return () => clearTimeout(id);
  }, [t, src, duration, custom]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = (file) => {
    if (!file?.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    setCustom(url);
    onChange({ blob: file, url, time: null });
  };

  return (
    <div>
      <video ref={vref} src={src} muted playsInline preload="auto" className="hidden" />
      <div className="relative">
        <div className={`flex h-20 overflow-hidden rounded ${custom ? 'opacity-40' : ''}`}>
          {strip.length ? strip.map((f, i) => <img key={i} src={f} alt="" className="h-full min-w-0 flex-1 object-cover" />)
            : Array.from({ length: STRIP }, (_, i) => <span key={i} className="skeleton h-full flex-1" />)}
        </div>
        <input type="range" min={0} max={Math.max(0, duration - 0.05)} step={0.05} value={t} disabled={!!custom}
          onChange={(e) => setT(+e.target.value)} aria-label="Chọn khung hình làm ảnh bìa"
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent disabled:cursor-default
            [&::-webkit-slider-thumb]:h-[88px] [&::-webkit-slider-thumb]:w-12 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:border-[3px] [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-[0_0_0_1px_rgba(0,0,0,.3),0_4px_12px_rgba(0,0,0,.3)]
            [&::-moz-range-thumb]:h-[84px] [&::-moz-range-thumb]:w-11 [&::-moz-range-thumb]:rounded [&::-moz-range-thumb]:border-[3px] [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-transparent" />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-fg-muted">
        <span>{custom ? 'Đang dùng ảnh tải lên' : `Khung hình tại ${t.toFixed(1)} giây — kéo để chọn`}</span>
        {custom ? (
          <button type="button" onClick={() => setCustom(null)} className="font-semibold text-brand-text hover:underline">Dùng khung hình từ video</button>
        ) : (
          <label className="inline-flex cursor-pointer items-center gap-1 font-semibold text-brand-text hover:underline">
            <ImagePlus size={14} /> Tải ảnh lên
            <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files[0])} />
          </label>
        )}
      </div>
    </div>
  );
}
