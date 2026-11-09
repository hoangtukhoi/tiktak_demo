import { useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Flag, Mail, Send } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import useAuth from '../../hooks/useAuth';
import { reportVideo, shareVideo } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';

const TARGETS = [
  ['Facebook', 'F', '#1877F2', (u) => `https://www.facebook.com/sharer/sharer.php?u=${u}`],
  ['X', 'X', '#111111', (u, t) => `https://twitter.com/intent/tweet?url=${u}&text=${t}`],
  ['Telegram', <Send key="t" size={18} />, '#229ED9', (u, t) => `https://t.me/share/url?url=${u}&text=${t}`],
  ['Email', <Mail key="m" size={18} />, '#6B645B', (u, t) => `mailto:?subject=${t}&body=${u}`],
];

export const REPORT_REASONS = [
  'Khoả thân hoặc nội dung tình dục', 'Bạo lực hoặc nội dung gây sốc', 'Quấy rối, bắt nạt', 'Ngôn từ thù ghét',
  'Thông tin sai lệch', 'Spam hoặc lừa đảo', 'Vi phạm bản quyền', 'Lý do khác',
];

export function ReportDialog({ video, open, onClose }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await reportVideo(video._id, reason, note.trim() || undefined);
      toast('Cảm ơn bạn. Chúng tôi sẽ xem xét video này.');
      onClose(); setReason(''); setNote('');
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title="Báo cáo video" variant="dialog" width={460}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Huỷ</Button><Button disabled={!reason} loading={busy} onClick={submit}>Gửi báo cáo</Button></div>}>
      <fieldset className="px-5 py-3">
        <legend className="mb-2 text-sm text-fg-muted">Vì sao bạn báo cáo video này?</legend>
        {REPORT_REASONS.map((r) => (
          <label key={r} className="flex cursor-pointer items-center gap-3 rounded px-2 py-2.5 hover:bg-surface-2">
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
            <span className="text-base">{r}</span>
          </label>
        ))}
        {reason && (
          <textarea className="input mt-2 min-h-[80px] resize-none" maxLength={300} placeholder="Mô tả thêm (không bắt buộc)" value={note} onChange={(e) => setNote(e.target.value)} />
        )}
      </fieldset>
    </Modal>
  );
}

export default function ShareSheet({ video, open, onClose, onShared }) {
  const { requireAuth } = useAuth();
  const [reporting, setReporting] = useState(false);
  const url = `${location.origin}/watch/${video._id}`;
  const done = () => { shareVideo(video._id); onShared?.(); };
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Đã sao chép liên kết'); done(); } catch { toast.error('Không sao chép được'); }
  };
  return (
    <>
      <Modal open={open} onClose={onClose} title="Chia sẻ" variant="sheet" width={420}>
        <div className="space-y-5 px-5 py-4">
          <div className="flex gap-2">
            <input readOnly value={url} className="input flex-1 text-sm text-fg-muted" onFocus={(e) => e.target.select()} aria-label="Liên kết video" />
            <Button variant="secondary" onClick={copy}><Copy size={16} /> Sao chép</Button>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {TARGETS.map(([name, mark, color, href]) => (
              <a key={name} href={href(encodeURIComponent(url), encodeURIComponent(video.title))} target="_blank" rel="noreferrer" onClick={done}
                className="flex flex-col items-center gap-2 rounded py-2 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
                <span className="grid h-11 w-11 place-items-center rounded-full text-[15px] font-bold text-white" style={{ background: color }}>{mark}</span>
                {name}
              </a>
            ))}
          </div>
          <button onClick={() => { if (requireAuth('Đăng nhập để báo cáo')) { onClose(); setReporting(true); } }}
            className="flex w-full items-center gap-3 rounded border border-line px-4 py-3 text-left text-sm font-semibold hover:bg-surface-2">
            <Flag size={18} strokeWidth={1.75} className="text-danger" /> Báo cáo video
          </button>
        </div>
      </Modal>
      <ReportDialog video={video} open={reporting} onClose={() => setReporting(false)} />
    </>
  );
}
