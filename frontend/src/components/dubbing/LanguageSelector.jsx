import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronRight } from 'lucide-react';
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
          if (t.status === 'done') { onSelect(t); onClose(); toast(`Đã lồng tiếng ${langs.find((l) => l.code === lang)?.name || lang}`, { icon: '🎧' }); }
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
    <Modal open={open} onClose={onClose} title="Dịch & lồng tiếng AI">
      <p className="mb-4 text-sm leading-relaxed text-paper-dim">
        Whisper nhận dạng giọng nói, SeamlessM4T dịch, rồi TTS đọc lại bằng ngôn ngữ bạn chọn. Thường mất dưới một phút.
      </p>
      <ul className="space-y-1.5">
        {(langs.length ? langs : Array.from({ length: 6 }, (_, i) => ({ code: 'sk' + i }))).map((l) => {
          const t = tracks[l.code];
          const isCurrent = (current || SOURCE_LANG) === l.code;
          if (!l.name) return <li key={l.code} className="skeleton h-14 rounded-2xl" />;
          return (
            <li key={l.code}>
              <button
                onClick={() => choose(l.code)}
                className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition duration-300 ease-out hover:translate-x-1 ${isCurrent ? 'bg-lime text-ink' : 'bg-ink-700 hover:bg-ink-600'}`}
              >
                <span className={`grid h-9 w-9 place-items-center rounded-xl font-mono text-xs font-bold ${isCurrent ? 'bg-ink text-lime' : 'bg-ink-800'}`}>
                  {LANG_FLAGS[l.code] || l.code.toUpperCase()}
                </span>
                <span className="flex-1 font-bold">
                  {l.name}
                  {l.code === SOURCE_LANG && <span className={`ml-2 font-mono text-[11px] ${isCurrent ? 'text-ink/60' : 'text-paper-mute'}`}>GỐC</span>}
                </span>
                {t && l.code !== SOURCE_LANG && !isCurrent ? <DubbingStatusBadge status={t.status} withBar /> : !isCurrent && <ChevronRight size={18} className="text-paper-mute" />}
              </button>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
