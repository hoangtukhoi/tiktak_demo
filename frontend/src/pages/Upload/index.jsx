import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Check, Music2, RotateCw, X } from 'lucide-react';
import VideoUploader from '../../components/video/VideoUploader';
import Button from '../../components/common/Button';
import Avatar from '../../components/common/Avatar';
import useAuth from '../../hooks/useAuth';
import { createVideo, getProgressSSE, getVideo, uploadVideoFile } from '../../api/video.api';
import { getSupportedLanguages, requestDubbing } from '../../api/dubbing.api';
import { errMsg } from '../../api/axiosClient';
import { parseHashtags } from '../../utils/format';
import { LANG_FLAGS } from '../../utils/constants';

const STEPS = [['uploading', 'Tải lên'], ['processing', 'Transcode HLS'], ['done', 'Sẵn sàng']];
const POLL_MS = 2000;
const POLL_LIMIT = 90; // ~3 phút

function Stepper({ phase, pct, detail }) {
  const idx = STEPS.findIndex(([k]) => k === phase);
  return (
    <div className="card p-5">
      <ol className="flex items-center gap-2">
        {STEPS.map(([k, label], i) => {
          const done = i < idx || phase === 'done';
          const cur = i === idx && phase !== 'done';
          return (
            <li key={k} className="flex flex-1 items-center gap-2">
              <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full font-mono text-xs font-bold transition duration-500 ${done ? 'bg-lime text-ink' : cur ? 'bg-paper text-ink' : 'bg-ink-600 text-paper-mute'}`}>
                {done ? <Check size={15} strokeWidth={3} /> : i + 1}
              </span>
              <span className={`text-sm font-bold ${cur || done ? '' : 'text-paper-mute'}`}>{label}</span>
              {i < STEPS.length - 1 && <span className={`h-px flex-1 transition-colors duration-500 ${done ? 'bg-lime' : 'bg-ink-500'}`} />}
            </li>
          );
        })}
      </ol>
      {phase !== 'done' && (
        <>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-ink-600">
            <motion.div className="h-full rounded-full bg-lime" animate={{ width: `${pct}%` }} transition={{ ease: 'easeOut' }} />
          </div>
          <p className="mt-2 flex justify-between font-mono text-xs text-paper-dim"><span>{detail}</span><span>{Math.round(pct)}%</span></p>
        </>
      )}
    </div>
  );
}

function PhonePreview({ url, title, tags, user }) {
  return (
    <div className="sticky top-6 mx-auto w-[280px]">
      <p className="label mb-3 text-center">Xem trước trên bảng tin</p>
      <div className="relative aspect-[9/19] overflow-hidden rounded-[40px] border-[10px] border-ink-700 bg-black shadow-[0_40px_80px_-30px_rgba(0,0,0,.9)]">
        <span className="absolute left-1/2 top-2 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-ink-700" />
        {url ? <video src={url} autoPlay muted loop playsInline className="h-full w-full object-cover" /> : <div className="skeleton h-full w-full" />}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
        <div className="absolute bottom-5 left-3 right-12 text-white">
          <p className="flex items-center gap-1.5 text-sm font-extrabold"><Avatar user={user} size={20} />@{user?.username}</p>
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug">{title || 'Tiêu đề video của bạn'}</p>
          {tags.length > 0 && <p className="mt-0.5 truncate font-mono text-[11px] font-bold">{tags.map((t) => `#${t}`).join(' ')}</p>}
          <p className="mt-2 flex items-center gap-1 text-[11px]"><Music2 size={11} /> Âm thanh gốc</p>
        </div>
        <div className="absolute bottom-16 right-2 flex flex-col gap-3">
          {[0, 1, 2].map((i) => <span key={i} className="h-8 w-8 rounded-full bg-white/20 backdrop-blur" />)}
        </div>
      </div>
    </div>
  );
}

const Toggle = forwardRef(function Toggle({ label, hint, ...props }, ref) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-2xl bg-ink-700 px-4 py-3">
      <span><span className="block font-bold">{label}</span><span className="text-sm text-paper-dim">{hint}</span></span>
      <input ref={ref} type="checkbox" className="peer sr-only" {...props} />
      <span className="relative h-7 w-12 shrink-0 rounded-full bg-ink-500 transition peer-checked:bg-lime after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-paper after:transition-transform after:duration-300 after:ease-spring peer-checked:after:translate-x-5 peer-checked:after:bg-ink peer-focus-visible:ring-2 peer-focus-visible:ring-lime" />
    </label>
  );
});

export default function Upload() {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | uploading | processing | done | failed
  const [pct, setPct] = useState(0);
  const [detail, setDetail] = useState('');
  const [videoId, setVideoId] = useState(null);
  const [langs, setLangs] = useState([]);
  const [dubLangs, setDubLangs] = useState([]);
  const cleanup = useRef(() => {});
  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm({ defaultValues: { allowComment: true, isPrivate: false } });

  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  useEffect(() => { getSupportedLanguages().then((l) => setLangs(l.filter((x) => x.code !== 'vi'))).catch(() => {}); }, []);
  useEffect(() => () => cleanup.current(), []);

  const title = watch('title') || '';
  const tags = parseHashtags(watch('hashtags'));

  const finish = (ok, id) => {
    cleanup.current();
    if (!ok) { setPhase('failed'); return; }
    setPhase('done'); setPct(100);
    dubLangs.forEach((l) => requestDubbing(id, l, 'vi').catch(() => {}));
    toast('Video đã sẵn sàng!', { icon: '🎬' });
  };

  // Fallback khi không có SSE: hỏi GET /videos/:id cho tới khi status = ready | failed
  const poll = (id) => {
    let n = 0;
    const t = setInterval(async () => {
      n += 1;
      setPct((p) => Math.min(95, p + 2));
      try {
        const v = await getVideo(id);
        setDetail(v.status === 'processing' ? 'Đang transcode 360p / 720p / 1080p' : `Trạng thái: ${v.status}`);
        if (v.status === 'ready') finish(true, id);
        else if (v.status === 'failed') finish(false, id);
      } catch { /* thử lại lần sau */ }
      if (n >= POLL_LIMIT) { cleanup.current(); setPhase('background'); }
    }, POLL_MS);
    cleanup.current = () => clearInterval(t);
  };

  const publish = async (form) => {
    const meta = {
      title: form.title.trim(),
      description: form.description?.trim() || undefined,
      hashtags: tags,
      isPrivate: form.isPrivate,
      allowComment: form.allowComment,
    };
    setPhase('uploading'); setPct(0); setDetail('Đang gửi file lên máy chủ');
    try {
      let id; let jobId;
      try {
        const fd = new FormData();
        fd.append('video', file);
        Object.entries(meta).forEach(([k, v]) => v !== undefined && fd.append(k, Array.isArray(v) ? JSON.stringify(v) : String(v)));
        ({ videoId: id, jobId } = await uploadVideoFile(fd, (p) => setPct(p * 0.5)));
      } catch (e) {
        if (e.response?.status !== 404) throw e;
        // Backend hiện chưa có route /upload -> tạo bản ghi metadata qua POST /videos
        const v = await createVideo(meta);
        id = v._id;
        toast('Máy chủ chưa hỗ trợ upload file — đã tạo bản ghi video', { icon: 'ℹ️' });
      }
      setVideoId(id);
      setPhase('processing'); setPct(50); setDetail('Đang xếp hàng xử lý');
      if (jobId) {
        const es = getProgressSSE(
          jobId,
          (d) => { setPct(50 + (d.progress ?? 0) / 2); if (d.step) setDetail(d.step); },
          (d) => finish(d.status === 'completed', id),
          () => poll(id)
        );
        cleanup.current = () => es.close();
      } else poll(id);
    } catch (e) {
      setPhase('failed');
      setDetail(errMsg(e, 'Tải lên thất bại'));
      toast.error(errMsg(e, 'Tải lên thất bại'));
    }
  };

  const restart = () => { cleanup.current(); setFile(null); setPhase('idle'); setPct(0); setVideoId(null); setDubLangs([]); reset(); };
  const busy = phase === 'uploading' || phase === 'processing';

  return (
    <div className="mx-auto max-w-[1100px] px-4 pb-16 pt-6 sm:px-8">
      <header className="mb-8">
        <p className="label">Tải lên</p>
        <h1 className="mt-2 text-4xl font-extrabold sm:text-5xl">Đăng một video mới</h1>
      </header>

      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div key="drop" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}>
            <VideoUploader onFile={setFile} />
          </motion.div>
        ) : (
          <motion.div key="form" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid gap-10 lg:grid-cols-[1fr_300px]">
            <form onSubmit={handleSubmit(publish)} className="space-y-5">
              <div className="flex items-center justify-between rounded-2xl bg-ink-800 px-4 py-3">
                <span className="truncate font-semibold">{file.name}</span>
                <span className="flex items-center gap-3 font-mono text-xs text-paper-dim">
                  {(file.size / 1048576).toFixed(1)} MB
                  {!busy && phase !== 'done' && <button type="button" onClick={restart} className="rounded-full p-1 hover:bg-ink-600" aria-label="Chọn file khác"><X size={16} /></button>}
                </span>
              </div>

              {phase !== 'idle' && <Stepper phase={phase === 'failed' || phase === 'background' ? 'processing' : phase} pct={pct} detail={detail} />}

              {phase === 'done' || phase === 'background' ? (
                <div className="card p-6">
                  <p className="text-2xl font-extrabold">{phase === 'done' ? 'Lên sóng rồi 🎉' : 'Video đang xử lý nền'}</p>
                  <p className="mt-1 text-paper-dim">
                    {phase === 'done' ? (dubLangs.length ? `AI đang lồng tiếng sang ${dubLangs.length} ngôn ngữ.` : 'Mọi người đã có thể xem video của bạn.') : 'Quá trình transcode lâu hơn dự kiến. Video sẽ tự xuất hiện khi xong.'}
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {phase === 'done' && <Link to={`/watch/${videoId}`} className="btn">Xem video</Link>}
                    <Link to={`/profile/${user?.username}`} className="btn-ghost">Tới hồ sơ</Link>
                    <button type="button" onClick={restart} className="btn-ghost">Đăng video khác</button>
                  </div>
                </div>
              ) : (
                <fieldset disabled={busy} className="space-y-5 disabled:opacity-60">
                  <label className="block">
                    <span className="label flex justify-between">Tiêu đề <span>{title.length}/200</span></span>
                    <input className={`input mt-2 ${errors.title ? '!border-coral' : ''}`} maxLength={200} placeholder="Một câu thật cuốn"
                      {...register('title', { required: 'Video cần có tiêu đề', validate: (v) => v.trim().length > 0 || 'Video cần có tiêu đề' })} />
                    {errors.title && <span className="mt-1.5 block text-sm font-semibold text-coral">{errors.title.message}</span>}
                  </label>
                  <label className="block">
                    <span className="label">Mô tả</span>
                    <textarea className="input mt-2 min-h-[100px] resize-y" maxLength={2000} placeholder="Kể thêm về video (không bắt buộc)" {...register('description')} />
                  </label>
                  <label className="block">
                    <span className="label">Hashtag</span>
                    <input className="input mt-2" placeholder="#travel #hanoi #ptit" {...register('hashtags')} />
                    {tags.length > 0 && (
                      <span className="mt-2 flex flex-wrap gap-1.5">{tags.map((t) => <span key={t} className="rounded-full bg-ink-700 px-2.5 py-1 font-mono text-xs font-bold">#{t}</span>)}</span>
                    )}
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <Toggle label="Cho phép bình luận" hint="Người xem có thể bình luận" {...register('allowComment')} />
                    <Toggle label="Riêng tư" hint="Chỉ mình bạn xem được" {...register('isPrivate')} />
                  </div>

                  {langs.length > 0 && (
                    <div>
                      <span className="label">Tự động lồng tiếng AI sau khi xử lý xong</span>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {langs.map((l) => {
                          const on = dubLangs.includes(l.code);
                          return (
                            <button key={l.code} type="button" onClick={() => setDubLangs((s) => (on ? s.filter((x) => x !== l.code) : [...s, l.code]))}
                              className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition duration-300 ease-spring active:scale-95 ${on ? 'bg-lime text-ink' : 'bg-ink-700 text-paper-dim hover:text-paper'}`}>
                              <span className="mr-1.5 font-mono text-[11px]">{LANG_FLAGS[l.code]}</span>{l.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {phase === 'failed' ? (
                    <div className="flex items-center gap-3">
                      <Button type="submit"><RotateCw size={17} /> Thử lại</Button>
                      <span className="text-sm font-semibold text-coral">{detail || 'Xử lý thất bại'}</span>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <Button type="submit" loading={busy} className="!px-8">{busy ? 'Đang đăng…' : 'Đăng video'}</Button>
                      <button type="button" onClick={restart} className="btn-ghost" disabled={busy}>Huỷ</button>
                    </div>
                  )}
                </fieldset>
              )}
            </form>
            <div className="hidden lg:block"><PhonePreview url={url} title={title} tags={tags} user={user} /></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
