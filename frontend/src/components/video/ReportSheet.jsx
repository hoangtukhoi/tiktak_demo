import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowLeft, Check, ChevronRight, ShieldCheck } from 'lucide-react';
import Modal from '../common/Modal';
import { reportVideo } from '../../api/video.api';
import { errMsg } from '../../api/axiosClient';
import { REPORT_REASONS } from '../../utils/constants';

/**
 * Báo cáo video: chọn lý do → mô tả thêm (không bắt buộc) → gửi.
 * Mỗi người chỉ báo cáo 1 video 1 lần; đủ 3 báo cáo video sẽ được đưa cho admin xem xét.
 */
export default function ReportSheet({ video, open, onClose, onReported }) {
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (open) { setReason(null); setNote(''); setDone(false); }
  }, [open]);

  const submit = async () => {
    setSending(true);
    try {
      await reportVideo(video._id, reason.value, note.trim() || undefined);
      setDone(true);
      onReported?.();
    } catch (e) {
      if (e.response?.status === 409) {
        toast('Bạn đã báo cáo video này rồi. Chúng tôi đang xem xét.', { icon: '🛡️' });
        onClose();
      } else toast.error(errMsg(e, 'Không gửi được báo cáo'));
    } finally {
      setSending(false);
    }
  };

  const title = done ? 'Đã gửi báo cáo' : reason ? reason.label : 'Báo cáo video';
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.div key="done" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="grid place-items-center py-8 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-lime text-ink"><ShieldCheck size={30} /></span>
            <p className="mt-4 text-lg font-extrabold">Cảm ơn bạn đã báo cáo</p>
            <p className="mt-1 max-w-[320px] text-sm text-paper-dim">Đội ngũ kiểm duyệt sẽ xem xét video này. Danh tính của bạn không được tiết lộ cho người đăng.</p>
            <button onClick={onClose} className="btn mt-6">Xong</button>
          </motion.div>
        ) : !reason ? (
          <motion.ul key="list" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} className="-mx-2 pb-1">
            <p className="px-2 pb-3 text-sm text-paper-dim">Video này có vấn đề gì?</p>
            {REPORT_REASONS.map((r) => (
              <li key={r.value}>
                <button onClick={() => setReason(r)} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-ink-700">
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold">{r.label}</span>
                    <span className="block text-xs text-paper-mute">{r.hint}</span>
                  </span>
                  <ChevronRight size={18} className="text-paper-mute" />
                </button>
              </li>
            ))}
          </motion.ul>
        ) : (
          <motion.div key="note" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}>
            <button onClick={() => setReason(null)} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-paper-dim hover:text-paper">
              <ArrowLeft size={16} /> Chọn lý do khác
            </button>
            <label className="label" htmlFor="report-note">Mô tả thêm {reason.value === 'other' ? '' : '(không bắt buộc)'}</label>
            <textarea
              id="report-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={4}
              placeholder="VD: phút 0:12 có hình ảnh bạo lực"
              className="input mt-2 resize-none"
            />
            <p className="mt-1 text-right font-mono text-[11px] text-paper-mute">{note.length}/300</p>
            <button
              onClick={submit}
              disabled={sending || (reason.value === 'other' && !note.trim())}
              className="btn mt-3 w-full"
            >
              <Check size={18} /> {sending ? 'Đang gửi…' : 'Gửi báo cáo'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </Modal>
  );
}
