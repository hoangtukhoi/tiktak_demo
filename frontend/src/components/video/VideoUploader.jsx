import { useRef, useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { MAX_VIDEO_DURATION_S, MAX_VIDEO_SIZE_MB } from '../../utils/constants';

export const readMeta = (file) =>
  new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight }); URL.revokeObjectURL(v.src); };
    v.onerror = () => resolve({ duration: 0, width: 0, height: 0 });
    v.src = URL.createObjectURL(file);
  });

/** Vùng chọn video, kiểm tra định dạng / dung lượng / thời lượng theo backend utils/constants.js */
export default function VideoUploader({ onFile }) {
  const input = useRef(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');

  const pick = async (file) => {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('video/')) return setError('Chỉ nhận file video (MP4, WebM, MOV).');
    if (file.size > MAX_VIDEO_SIZE_MB * 1024 * 1024) return setError(`Video lớn hơn ${MAX_VIDEO_SIZE_MB} MB.`);
    const meta = await readMeta(file);
    if (meta.duration > MAX_VIDEO_DURATION_S) return setError(`Video dài ${Math.round(meta.duration)} giây, tối đa ${MAX_VIDEO_DURATION_S / 60} phút.`);
    onFile(file, meta);
  };

  return (
    <div>
      <button type="button" onClick={() => input.current.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
        className={`flex h-[420px] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors ${drag ? 'border-brand bg-brand-soft' : 'border-line bg-surface hover:border-fg-subtle'}`}>
        <CloudUpload size={44} strokeWidth={1.4} className={drag ? 'text-brand-text' : 'text-fg-subtle'} />
        <p className="mt-4 text-md font-semibold">Chọn video để tải lên</p>
        <p className="mt-1 text-sm text-fg-muted">hoặc kéo thả file vào đây</p>
        <dl className="mt-6 grid grid-cols-2 gap-x-8 gap-y-1 text-left text-xs text-fg-muted">
          <dt>Định dạng</dt><dd className="text-fg">MP4, WebM, MOV</dd>
          <dt>Dung lượng</dt><dd className="text-fg">tối đa {MAX_VIDEO_SIZE_MB} MB</dd>
          <dt>Thời lượng</dt><dd className="text-fg">tối đa {MAX_VIDEO_DURATION_S / 60} phút</dd>
          <dt>Khuyến nghị</dt><dd className="text-fg">dọc 9:16, ≥ 720p</dd>
        </dl>
        <span className="btn-primary mt-7 px-8">Chọn file</span>
      </button>
      <input ref={input} type="file" accept="video/*" hidden onChange={(e) => pick(e.target.files[0])} />
      {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
    </div>
  );
}
