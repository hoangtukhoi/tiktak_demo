import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Check, ChevronRight } from 'lucide-react';
import Modal from '../common/Modal';
import DubbingStatusBadge from './DubbingStatusBadge';
import { getDubbingStatus, getSupportedLanguages, getVideoTracks, requestDubbing } from '../../api/dubbing.api';
import { errMsg } from '../../api/axiosClient';
import { LANG_FLAGS } from '../../utils/constants';

let langCache = null;
const POLL_MS = 2000;
const SOURCE_LANG = 'vi';

/**
 * Chọn ngôn ngữ lồng tiếng. Luôn được mount cùng VideoCard để việc polling tiếp tục khi sheet đã đóng.
 * onSelect(track | null) — null = quay về âm thanh gốc.
 */
export default function LanguageSelector({ video, open, onClose, current, onSelect, requireAuth }) {
  const [langs, setLangs] = useState(langCache || []);
  const [tracks, setTracks] = useState({}); // targetLang -> AudioTrack
  const timers = useRef({});

  useEffect(() => () => Object.values(timers.current).forEach(clearInterval), []);

  useEffect(() => {
    if (!open) return;
    if (!langCache) getSupportedLanguages().then((l) => setLangs((langCache = l))).catch(() => {});
    getVideoTracks(video._id)
      .then((ts) => setTracks((prev) => ({ ...Object.fromEntries((ts || []).map((t) => [t.targetLang, t])), ...prev })))
      .catch(() => {});
  }, [open, video._id]);

  const poll = (lang, trackId) => {
    clearInterval(timers.current[lang]);
    timers.current[lang] = setInterval(async () => {
      try {
        const t = await getDubbingStatus(trackId);
        setTracks((s) => ({ ...s, [lang]: t }));
        if (t.status === 'done' || t.status === 'failed') {
          clearInterval(timers.current[lang]);
          if (t.status === 'done') { onSelect(t); onClose(); toast(`Đã lồng tiếng ${langs.find((l) => l.code === lang)?.name || lang}`); }
          else toast.error(t.error || 'Lồng tiếng thất bại');
        }
      } catch { clearInterval(timers.current[lang]); }
    }, POLL_MS);
  };

  const choose = async (code) => {
    if (code === SOURCE_LANG) { onSelect(null); onClose(); return; }
    const t = tracks[code];
    if (t?.status === 'done') { onSelect(t); onClose(); return; }
    if (t && t.status !== 'failed') return; // đang xử lý
    if (!requireAuth('Đăng nhập để dùng AI lồng tiếng')) return;
    try {
      const r = await requestDubbing(video._id, code, SOURCE_LANG);
      if (r.status === 'done') { setTracks((s) => ({ ...s, [code]: r })); onSelect(r); onClose(); return; }
      setTracks((s) => ({ ...s, [code]: { _id: r.trackId, targetLang: code, status: r.status || 'pending' } }));
      poll(code, r.trackId);
    } catch (e) {
      toast.error(errMsg(e, 'Không gửi được yêu cầu lồng tiếng'));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Dịch & lồng tiếng AI" variant="drawer">
      <div className="px-5 py-4">
        <p className="mb-4 text-sm text-fg-muted">
          AI nhận dạng giọng nói, dịch rồi đọc lại bằng ngôn ngữ bạn chọn, kèm phụ đề. Thường mất dưới một phút.
        </p>
        <ul className="space-y-1">
          {(langs.length ? langs : Array.from({ length: 6 }, (_, i) => ({ code: 'sk' + i }))).map((l) => {
            const t = tracks[l.code];
            const isCurrent = (current || SOURCE_LANG) === l.code;
            if (!l.name) return <li key={l.code} className="skeleton h-12 rounded" />;
            return (
              <li key={l.code}>
                <button onClick={() => choose(l.code)} aria-current={isCurrent}
                  className={`flex h-12 w-full items-center gap-3 rounded px-3 text-left transition-colors ${isCurrent ? 'bg-brand-soft' : 'hover:bg-surface-2'}`}>
                  <span className={`grid h-7 w-9 place-items-center rounded-sm text-2xs font-bold ${isCurrent ? 'bg-brand text-white' : 'bg-surface-2 text-fg-muted'}`}>
                    {LANG_FLAGS[l.code] || l.code.toUpperCase()}
                  </span>
                  <span className={`flex-1 text-base ${isCurrent ? 'font-semibold text-brand-text' : 'font-medium'}`}>
                    {l.name}
                    {l.code === SOURCE_LANG && <span className="ml-2 text-xs font-normal text-fg-muted">Âm thanh gốc</span>}
                  </span>
                  {isCurrent ? <Check size={18} className="text-brand-text" />
                    : t && l.code !== SOURCE_LANG ? <DubbingStatusBadge status={t.status} withBar /> : <ChevronRight size={18} className="text-fg-subtle" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Modal>
  );
}
