import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Upload } from 'lucide-react';
import { MAX_VIDEO_DURATION_S, MAX_VIDEO_SIZE_MB } from '../../utils/constants';

const readDuration = (file) =>
  new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { resolve(v.duration); URL.revokeObjectURL(v.src); };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });

/** Vùng kéo-thả video, kiểm tra định dạng / dung lượng / thời lượng theo backend utils/constants.js */
export default function VideoUploader({ onFile }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');

  const pick = async (file) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('video/')) return setError('Chỉ chấp nhận file video (MP4, WebM, MOV).');
    if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) return setError(`Video vượt quá ${MAX_VIDEO_SIZE_MB} MB.`);
    const dur = await readDuration(file);
    if (dur > MAX_VIDEO_DURATION_S) return setError(`Video dài ${Math.round(dur)} giây — tối đa ${MAX_VIDEO_DURATION_S / 60} phút.`);
    onFile(file, dur);
  };

  return (
    <div>
      <motion.button
        type="button"
        onClick={() => input.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        animate={{ scale: drag ? 1.015 : 1 }}
        className={`group relative grid h-[380px] w-full place-items-center overflow-hidden rounded-[28px] border-2 border-dashed text-center transition-colors duration-300 ${drag ? 'border-lime bg-lime/5' : 'border-ink-500 hover:border-paper-mute'}`}
      >
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lime/10 blur-3xl transition-transform duration-700 group-hover:scale-125" />
        <div className="relative">
          <motion.span animate={{ y: drag ? -8 : 0 }} className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-lime text-ink transition-transform duration-500 ease-spring group-hover:-rotate-6">
            <Upload size={34} strokeWidth={2.4} />
          </motion.span>
          <p className="mt-5 text-2xl font-extrabold tracking-tight">{drag ? 'Thả vào đây' : 'Kéo thả video vào đây'}</p>
          <p className="mt-1 text-paper-dim">hoặc bấm để chọn từ máy</p>
          <p className="label mt-6">MP4 · WEBM · MOV · ≤ {MAX_VIDEO_SIZE_MB}MB · ≤ {MAX_VIDEO_DURATION_S / 60} phút</p>
        </div>
      </motion.button>
      <input ref={input} type="file" accept="video/*" hidden onChange={(e) => pick(e.target.files[0])} />
      {error && <p className="mt-3 rounded-2xl bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">{error}</p>}
    </div>
  );
}
