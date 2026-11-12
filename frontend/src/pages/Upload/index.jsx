import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { AtSign, Check, Music2, RotateCw, X } from 'lucide-react';
import VideoUploader from '../../components/video/VideoUploader';
import CoverPicker from '../../components/video/CoverPicker';
import Button from '../../components/common/Button';
import Avatar from '../../components/common/Avatar';
import Spinner from '../../components/common/Spinner';
import useAuth from '../../hooks/useAuth';
import { createVideo, getProgressSSE, getVideo, uploadVideoFile } from '../../api/video.api';
import { getSupportedLanguages, requestDubbing } from '../../api/dubbing.api';
import { mentionSuggest } from '../../api/video.api';
import { errMsg, USE_MOCK } from '../../api/axiosClient';
import { formatDuration, parseHashtags } from '../../utils/format';
import { VISIBILITY } from '../../utils/constants';

const POLL_MS = 2000;
const POLL_LIMIT = 90;
const STEPS = [['upload', 'Tải lên'], ['process', 'Xử lý video'], ['review', 'Kiểm duyệt nội dung'], ['done', 'Hoàn tất']];

function Section({ title, hint, children }) {
  return (
    <section className="card p-5">
      <h2 className="text-md font-bold">{title}</h2>
      {hint && <p className="mt-0.5 text-sm text-fg-muted">{hint}</p>}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function Switch({ checked, onChange, label, hint, disabled }) {
  return (
    <label className={`flex items-center justify-between gap-4 ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
      <span><span className="block text-base font-medium">{label}</span>{hint && <span className="block text-xs text-fg-muted">{hint}</span>}</span>
      <input type="checkbox" role="switch" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="relative h-6 w-10 shrink-0 rounded-full bg-surface-3 transition-colors peer-checked:bg-brand peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40
        after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-4" />
    </label>
  );
}

/** Gắn thẻ người dùng: gõ để tìm, chọn để thêm chip */
function MentionPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  useEffect(() => {
    const term = q.replace(/^@/, '').trim();
    if (!term) return setHits([]);
    const t = setTimeout(() => mentionSuggest(term).then((u) => setHits(u.filter((x) => !value.some((v) => v._id === x._id)).slice(0, 5))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q, value]);
  return (
    <div>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((u) => (
            <span key={u._id} className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-1 pr-2 text-sm font-medium">
              <Avatar user={u} size={20} /> @{u.username}
              <button type="button" onClick={() => onChange(value.filter((x) => x._id !== u._id))} aria-label={`Bỏ @${u.username}`} className="text-fg-muted hover:text-fg"><X size={14} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <AtSign size={16} className="pointer-events-none absolute left-3 top-3 text-fg-subtle" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm tên người dùng để gắn thẻ" aria-label="Gắn thẻ người dùng" />
        {hits.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-line bg-surface p-1 shadow-pop">
            {hits.map((u) => (
              <li key={u._id}>
                <button type="button" onClick={() => { onChange([...value, u]); setQ(''); }} className="flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left hover:bg-surface-2">
                  <Avatar user={u} size={28} /><span className="text-sm font-semibold">{u.username}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stepper({ step, pct, detail }) {
  const idx = STEPS.findIndex(([k]) => k === step);
  return (
    <div className="card p-5">
      <ol className="space-y-3">
        {STEPS.map(([k, label], i) => {
          const done = i < idx || step === 'done';
          const cur = i === idx && step !== 'done';
          return (
            <li key={k} className="flex items-center gap-3">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-2xs font-bold ${done ? 'bg-success text-white' : cur ? 'bg-brand text-white' : 'bg-surface-2 text-fg-subtle'}`}>
                {done ? <Check size={13} strokeWidth={3} /> : cur ? <Spinner size={11} /> : i + 1}
              </span>
              <span className={`text-base ${cur ? 'font-semibold' : done ? '' : 'text-fg-subtle'}`}>{label}</span>
              {cur && k === 'upload' && <span className="tabular ml-auto text-sm text-fg-muted">{Math.round(pct)}%</span>}
            </li>
          );
        })}
      </ol>
      {step === 'upload' && <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} /></div>}
      {detail && <p className="mt-3 text-sm text-fg-muted">{detail}</p>}
    </div>
  );
}

function Preview({ url, cover, title, tags, user }) {
  return (
    <div className="sticky top-6">
      <p className="mb-3 text-center text-xs font-semibold uppercase tracking-wider text-fg-subtle">Xem trước</p>
      <div className="relative mx-auto aspect-[9/16] w-[260px] overflow-hidden rounded-2xl bg-black ring-1 ring-line">
        {url ? <video src={url} poster={cover || undefined} autoPlay muted loop playsInline className="h-full w-full object-cover" /> : <div className="skeleton h-full w-full" />}
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-4 left-3 right-12 text-white">
          <p className="text-shadow flex items-center gap-1.5 text-sm font-bold"><Avatar user={user} size={20} />{user?.username}</p>
          <p className="text-shadow mt-1 line-clamp-2 text-xs">{title || 'Tiêu đề video'}</p>
          {tags.length > 0 && <p className="text-shadow mt-0.5 truncate text-xs font-semibold">{tags.map((t) => `#${t}`).join(' ')}</p>}
          <p className="text-shadow mt-1.5 flex items-center gap-1 text-2xs"><Music2 size={11} /> Âm thanh gốc</p>
        </div>
      </div>
      {cover && (
        <div className="mx-auto mt-4 flex w-[260px] items-center gap-3 text-sm text-fg-muted">
          <img src={cover} alt="Ảnh bìa đã chọn" className="h-16 w-12 rounded object-cover ring-1 ring-line" /> Ảnh bìa trên hồ sơ
        </div>
      )}
    </div>
  );
}

const DEFAULTS = { title: '', description: '', tags: '', visibility: 'public', allowComment: true, allowDuet: true, schedule: false, scheduledAt: '', sourceLang: 'vi', autoCaption: true };
const minSchedule = () => new Date(Date.now() + 15 * 60e3 - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16);

export default function Upload() {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState(null);
  const [f, setF] = useState(DEFAULTS);
  const [mentions, setMentions] = useState([]);
  const [cover, setCover] = useState(null);
  const [langs, setLangs] = useState([]);
  const [dubLangs, setDubLangs] = useState([]);
  const [step, setStep] = useState(null); // null | upload | process | review | done | failed
  const [pct, setPct] = useState(0);
  const [detail, setDetail] = useState('');
  const [result, setResult] = useState(null); // { id, kind: posted|scheduled|draft|flagged }
  const [errors, setErrors] = useState({});
  const cleanup = useRef(() => {});

  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => url && URL.revokeObjectURL(url), [url]);
  useEffect(() => { getSupportedLanguages().then(setLangs).catch(() => {}); return () => cleanup.current(); }, []);

  const set = (k) => (v) => setF((s) => ({ ...s, [k]: v?.target ? v.target.value : v }));
  const tags = parseHashtags(f.tags);
  const busy = step && step !== 'done' && step !== 'failed';

  const finish = (id, v, kind) => {
    cleanup.current();
    setStep('done');
    if (kind !== 'draft' && v?.moderationStatus !== 'removed') dubLangs.forEach((l) => requestDubbing(id, l, f.sourceLang).catch(() => {}));
    setResult({ id, kind });
  };

  // Theo dõi trạng thái bằng GET /videos/:id: status (processing -> ready) rồi moderationStatus (pending -> approved/flagged/removed)
  const watch = (id, kind) => {
    let n = 0;
    const tick = async () => {
      n += 1;
      try {
        const v = await getVideo(id);
        if (v.status === 'failed') { cleanup.current(); setStep('failed'); setDetail('Xử lý video thất bại. Kiểm tra file và thử lại.'); return; }
        if (v.status !== 'ready') { setStep('process'); setDetail('Đang chuyển mã sang HLS 360p / 720p / 1080p và tạo ảnh bìa.'); return; }
        if (v.moderationStatus === 'pending') { setStep('review'); setDetail('Mô hình kiểm duyệt đang quét khung hình.'); return; }
        if (v.moderationStatus === 'removed') { cleanup.current(); setStep('failed'); setDetail('Video vi phạm tiêu chuẩn cộng đồng và đã bị chặn.'); return; }
        finish(id, v, v.moderationStatus === 'flagged' ? 'flagged' : kind);
      } catch { /* thử lại lần sau */ }
      if (n >= POLL_LIMIT) { cleanup.current(); finish(id, null, kind); }
    };
    const t = setInterval(tick, POLL_MS);
    tick();
    cleanup.current = () => clearInterval(t);
  };

  const submit = async (asDraft) => {
    const errs = {};
    if (!f.title.trim()) errs.title = 'Video cần có tiêu đề';
    if (f.schedule && !asDraft && (!f.scheduledAt || new Date(f.scheduledAt) < new Date(Date.now() + 10 * 60e3))) errs.scheduledAt = 'Chọn thời điểm sau ít nhất 15 phút';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const kind = asDraft ? 'draft' : f.schedule ? 'scheduled' : 'posted';
    const fields = {
      title: f.title.trim(), description: f.description.trim(), hashtags: tags, mentions: mentions.map((u) => u._id),
      visibility: f.visibility, isPrivate: f.visibility === 'private', allowComment: f.allowComment, allowDuet: f.allowDuet,
      scheduledAt: f.schedule && !asDraft ? new Date(f.scheduledAt).toISOString() : undefined, isDraft: asDraft,
      sourceLang: f.sourceLang, autoCaption: f.autoCaption, dubLangs,
    };
    setStep('upload'); setPct(0); setDetail('');
    try {
      let id; let jobId;
      try {
        const fd = new FormData();
        fd.append('video', file);
        if (cover?.blob) fd.append('thumbnail', cover.blob, 'cover.jpg');
        Object.entries(fields).forEach(([k, v]) => v !== undefined && fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v)));
        ({ videoId: id, jobId } = await uploadVideoFile(fd, setPct));
      } catch (e) {
        if (e.response?.status !== 404) throw e;
        // Backend chưa có route /upload -> tạo bản ghi metadata qua POST /videos
        id = (await createVideo(fields))._id;
        toast('Máy chủ chưa hỗ trợ upload file, đã tạo bản ghi video');
      }
      setPct(100); setStep('process');
      if (jobId && !USE_MOCK) {
        const es = getProgressSSE(jobId, (d) => d.step && setDetail(d.step), () => watch(id, kind), () => watch(id, kind));
        cleanup.current = () => es.close();
      } else watch(id, kind);
    } catch (e) {
      setStep('failed'); setDetail(errMsg(e, 'Tải lên thất bại'));
    }
  };

  const reset = () => { cleanup.current(); setFile(null); setMeta(null); setF(DEFAULTS); setMentions([]); setCover(null); setDubLangs([]); setStep(null); setResult(null); setErrors({}); };

  if (!file) {
    return (
      <div className="mx-auto max-w-[880px] px-4 py-6 lg:py-10">
        <h1 className="text-xl font-bold lg:text-2xl">Tải video lên</h1>
        <p className="mb-6 mt-1 text-fg-muted">Đăng lên tài khoản <b className="font-semibold text-fg">@{user?.username}</b></p>
        <VideoUploader onFile={(fl, m) => { setFile(fl); setMeta(m); setF((s) => ({ ...s, title: fl.name.replace(/\.[^.]+$/, '').slice(0, 200) })); }} />
      </div>
    );
  }

  const RESULT = {
    posted: ['Video đã được đăng', 'Mọi người có thể xem video của bạn ngay bây giờ.'],
    scheduled: ['Đã lên lịch đăng', `Video sẽ tự đăng lúc ${new Date(f.scheduledAt).toLocaleString('vi-VN')}.`],
    draft: ['Đã lưu bản nháp', 'Mở lại trong tab Bản nháp trên hồ sơ của bạn.'],
    flagged: ['Video đang chờ duyệt', 'Hệ thống phát hiện nội dung cần xem lại. Video sẽ hiển thị sau khi quản trị viên duyệt.'],
  };

  return (
    <div className="mx-auto max-w-[1120px] px-4 py-6 lg:py-8">
      <div className="mb-6 flex items-center gap-4 rounded-lg border border-line bg-surface p-3">
        <video src={url} muted className="h-14 w-10 rounded bg-black object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{file.name}</p>
          <p className="tabular text-sm text-fg-muted">{(file.size / 1048576).toFixed(1)} MB · {formatDuration((meta?.duration || 0) * 1000)}{meta?.width ? ` · ${meta.width}×${meta.height}` : ''}</p>
        </div>
        {!step && <button onClick={reset} className="btn-ghost btn-sm">Đổi video</button>}
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          {step && <Stepper step={step === 'failed' ? 'process' : step} pct={pct} detail={step === 'failed' || step === 'done' ? '' : detail} />}

          {step === 'failed' && (
            <div role="alert" className="card flex items-center justify-between gap-4 border-danger/40 p-5">
              <p className="text-danger">{detail || 'Có lỗi xảy ra'}</p>
              <Button variant="outline" onClick={() => setStep(null)}><RotateCw size={16} /> Thử lại</Button>
            </div>
          )}

          {result ? (
            <div className="card p-6">
              <h2 className="text-lg font-bold">{RESULT[result.kind][0]}</h2>
              <p className="mt-1 text-fg-muted">{RESULT[result.kind][1]}{dubLangs.length > 0 && result.kind !== 'draft' ? ` AI đang lồng tiếng sang ${dubLangs.length} ngôn ngữ.` : ''}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {result.kind !== 'draft' && <Link to={`/watch/${result.id}`} className="btn-primary">Xem video</Link>}
                <Link to={`/profile/${user?.username}`} className="btn-outline">Tới hồ sơ</Link>
                <button onClick={reset} className="btn-ghost">Đăng video khác</button>
              </div>
            </div>
          ) : (
            <fieldset disabled={busy} className="space-y-4 disabled:opacity-60">
              <Section title="Chi tiết">
                <label className="block">
                  <span className="label flex justify-between">Tiêu đề <span className="tabular font-normal text-fg-subtle">{f.title.length}/200</span></span>
                  <input className={`input ${errors.title ? '!border-danger' : ''}`} maxLength={200} value={f.title} onChange={set('title')} aria-invalid={!!errors.title} />
                  {errors.title && <span className="mt-1 block text-sm text-danger">{errors.title}</span>}
                </label>
                <label className="block">
                  <span className="label flex justify-between">Mô tả <span className="tabular font-normal text-fg-subtle">{f.description.length}/2000</span></span>
                  <textarea className="input min-h-[96px] resize-y" maxLength={2000} value={f.description} onChange={set('description')} placeholder="Kể thêm về video của bạn" />
                </label>
                <label className="block">
                  <span className="label">Hashtag</span>
                  <input className="input" value={f.tags} onChange={set('tags')} placeholder="#hanoi #amthuc #ptit" />
                  {tags.length > 0 && <span className="mt-2 flex flex-wrap gap-1.5">{tags.map((t) => <span key={t} className="rounded bg-surface-2 px-2 py-0.5 text-sm font-medium">#{t}</span>)}</span>}
                  {tags.length >= 10 && <span className="hint">Tối đa 10 hashtag.</span>}
                </label>
                <div><span className="label">Gắn thẻ người khác</span><MentionPicker value={mentions} onChange={setMentions} /></div>
              </Section>

              <Section title="Ảnh bìa" hint="Ảnh hiển thị trên hồ sơ và kết quả tìm kiếm.">
                <CoverPicker src={url} duration={meta?.duration || 0} onChange={setCover} />
              </Section>

              <Section title="Quyền riêng tư">
                <div role="radiogroup" aria-label="Ai có thể xem video này" className="grid gap-2 sm:grid-cols-3">
                  {VISIBILITY.map(([v, l]) => (
                    <label key={v} className={`flex cursor-pointer items-center gap-2.5 rounded border px-3 py-2.5 text-sm font-medium transition-colors ${f.visibility === v ? 'border-brand bg-brand-soft text-brand-text' : 'border-line hover:bg-surface-2'}`}>
                      <input type="radio" name="visibility" value={v} checked={f.visibility === v} onChange={set('visibility')} className="sr-only" />
                      <span className={`grid h-4 w-4 place-items-center rounded-full border-2 ${f.visibility === v ? 'border-brand' : 'border-fg-subtle'}`}>{f.visibility === v && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}</span>
                      {l}
                    </label>
                  ))}
                </div>
                <Switch label="Cho phép bình luận" checked={f.allowComment} onChange={set('allowComment')} />
                <Switch label="Cho phép Duet" hint="Người khác quay video song song với video của bạn" checked={f.allowDuet} onChange={set('allowDuet')} />
              </Section>

              <Section title="Phụ đề & lồng tiếng AI">
                <label className="block">
                  <span className="label">Ngôn ngữ nói trong video</span>
                  <select className="input" value={f.sourceLang} onChange={set('sourceLang')}>
                    {(langs.length ? langs : [{ code: 'vi', name: 'Tiếng Việt' }]).map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
                  </select>
                </label>
                <Switch label="Tạo phụ đề tự động" hint="Nhận dạng giọng nói và tạo phụ đề cho video" checked={f.autoCaption} onChange={set('autoCaption')} />
                {langs.length > 0 && (
                  <div>
                    <span className="label">Lồng tiếng sẵn sang</span>
                    <div className="flex flex-wrap gap-2">
                      {langs.filter((l) => l.code !== f.sourceLang).map((l) => {
                        const on = dubLangs.includes(l.code);
                        return (
                          <button key={l.code} type="button" aria-pressed={on} onClick={() => setDubLangs((s) => (on ? s.filter((x) => x !== l.code) : [...s, l.code]))}
                            className={`chip ${on ? 'chip-active' : ''}`}>{on && <Check size={14} />}{l.name}</button>
                        );
                      })}
                    </div>
                    <p className="hint">Người xem vẫn có thể yêu cầu ngôn ngữ khác ngay trên video.</p>
                  </div>
                )}
              </Section>

              <Section title="Lên lịch">
                <Switch label="Hẹn giờ đăng" hint="Video được xử lý ngay và tự đăng vào thời điểm đã chọn" checked={f.schedule} onChange={set('schedule')} />
                {f.schedule && (
                  <label className="block">
                    <span className="label">Thời điểm đăng</span>
                    <input type="datetime-local" className={`input max-w-xs ${errors.scheduledAt ? '!border-danger' : ''}`} min={minSchedule()} value={f.scheduledAt} onChange={set('scheduledAt')} />
                    {errors.scheduledAt && <span className="mt-1 block text-sm text-danger">{errors.scheduledAt}</span>}
                  </label>
                )}
              </Section>

              <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
                <button type="button" onClick={reset} className="btn-ghost mr-auto">Huỷ</button>
                <Button variant="outline" onClick={() => submit(true)}>Lưu nháp</Button>
                <Button onClick={() => submit(false)} className="min-w-[120px]">{f.schedule ? 'Lên lịch' : 'Đăng'}</Button>
              </div>
            </fieldset>
          )}
        </div>
        <div className="hidden lg:block"><Preview url={url} cover={cover?.url} title={f.title} tags={tags} user={user} /></div>
      </div>
    </div>
  );
}
