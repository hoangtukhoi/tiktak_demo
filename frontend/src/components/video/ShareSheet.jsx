import { useState } from 'react';
import toast from 'react-hot-toast';
import { Copy, Flag, Mail, Repeat2, Send } from 'lucide-react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import ReportDialog from '../common/ReportDialog';
import useAuth from '../../hooks/useAuth';

const TARGETS = [
  ['Facebook', 'F', '#1877F2', (u) => `https://www.facebook.com/sharer/sharer.php?u=${u}`],
  ['X', 'X', '#111111', (u, t) => `https://twitter.com/intent/tweet?url=${u}&text=${t}`],
  ['Telegram', <Send key="t" size={18} />, '#229ED9', (u, t) => `https://t.me/share/url?url=${u}&text=${t}`],
  ['Email', <Mail key="m" size={18} />, '#6B645B', (u, t) => `mailto:?subject=${t}&body=${u}`],
];

/**
 * Bảng chia sẻ.
 * onShared(method): gọi sau mỗi lần chia sẻ (VideoCard ghi lượt chia sẻ — mỗi tài khoản chỉ tính 1 lần / video)
 * onRepost: có thì hiện nút Đăng lại; canReport: hiện nút Báo cáo (ẩn với video của mình / admin)
 */
export default function ShareSheet({ video, open, onClose, onShared, onRepost, canReport = true, reportOpen, onReportOpen }) {
  const { requireAuth } = useAuth();
  const [reportingLocal, setReportingLocal] = useState(false);
  const reporting = reportOpen ?? reportingLocal;
  const setReporting = onReportOpen ?? setReportingLocal;
  const url = `${location.origin}/watch/${video._id}`;
  const done = (method) => onShared?.(method);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('Đã sao chép liên kết'); done('copy_link'); } catch { toast.error('Không sao chép được'); }
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
              <a key={name} href={href(encodeURIComponent(url), encodeURIComponent(video.title))} target="_blank" rel="noreferrer" onClick={() => done(name.toLowerCase())}
                className="flex flex-col items-center gap-2 rounded py-2 text-xs font-medium text-fg-muted hover:bg-surface-2 hover:text-fg">
                <span className="grid h-11 w-11 place-items-center rounded-full text-[15px] font-bold text-white" style={{ background: color }}>{mark}</span>
                {name}
              </a>
            ))}
          </div>
          {(onRepost || canReport) && (
            <div className="space-y-2">
              {onRepost && (
                <button onClick={onRepost} aria-pressed={!!video.isReposted}
                  className={`flex w-full items-center gap-3 rounded border px-4 py-3 text-left text-sm font-semibold transition-colors ${video.isReposted ? 'border-brand bg-brand-soft text-brand-text' : 'border-line hover:bg-surface-2'}`}>
                  <Repeat2 size={18} strokeWidth={1.9} className="text-brand-text" />
                  <span className="flex-1">{video.isReposted ? 'Huỷ đăng lại' : 'Đăng lại'}</span>
                  <span className="text-xs font-normal text-fg-muted">{video.isReposted ? 'Người theo dõi sẽ không thấy nữa' : 'Hiện cho người theo dõi bạn'}</span>
                </button>
              )}
              {canReport && (
                <button onClick={() => { if (requireAuth('Đăng nhập để báo cáo')) { onClose(); setReporting(true); } }}
                  className="flex w-full items-center gap-3 rounded border border-line px-4 py-3 text-left text-sm font-semibold hover:bg-surface-2">
                  <Flag size={18} strokeWidth={1.75} className="text-danger" /> Báo cáo video
                </button>
              )}
            </div>
          )}
        </div>
      </Modal>
      {canReport && <ReportDialog type="video" targetId={video._id} open={reporting} onClose={() => setReporting(false)} />}
    </>
  );
}
