import { useState } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import Button from './Button';
import { reportComment, reportVideo } from '../../api/video.api';
import { reportUser } from '../../api/user.api';
import { REPORT_REASONS, USER_REPORT_REASONS } from '../../utils/constants';
import { errMsg } from '../../api/axiosClient';

const KIND = {
  video: { title: 'Báo cáo video', ask: 'Vì sao bạn báo cáo video này?', done: 'Cảm ơn bạn. Chúng tôi sẽ xem xét video này.', reasons: REPORT_REASONS, send: reportVideo },
  comment: { title: 'Báo cáo bình luận', ask: 'Vì sao bạn báo cáo bình luận này?', done: 'Cảm ơn bạn. Chúng tôi sẽ xem xét bình luận này.', reasons: REPORT_REASONS.filter((r) => r.value !== 'copyright'), send: reportComment },
  user: { title: 'Báo cáo tài khoản', ask: 'Vì sao bạn báo cáo tài khoản này?', done: 'Cảm ơn bạn. Chúng tôi sẽ xem xét tài khoản này.', reasons: USER_REPORT_REASONS, send: reportUser },
};

/**
 * Hộp thoại báo cáo dùng chung.
 * type: 'video' | 'comment' | 'user' ; targetId: _id video / bình luận, hoặc username của tài khoản
 */
export default function ReportDialog({ type = 'video', targetId, open, onClose }) {
  const k = KIND[type];
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await k.send(targetId, reason, note.trim() || undefined);
      toast(k.done);
      onClose(); setReason(''); setNote('');
    } catch (e) { toast.error(errMsg(e)); }
    setBusy(false);
  };
  return (
    <Modal open={open} onClose={onClose} title={k.title} variant="dialog" width={460}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Huỷ</Button><Button disabled={!reason || (reason === 'other' && !note.trim())} loading={busy} onClick={submit}>Gửi báo cáo</Button></div>}>
      <fieldset className="px-5 py-3">
        <legend className="mb-2 text-sm text-fg-muted">{k.ask}</legend>
        {k.reasons.map((r) => (
          <label key={r.value} className="flex cursor-pointer items-center gap-3 rounded px-2 py-2 hover:bg-surface-2">
            <input type="radio" name={`reason-${type}`} value={r.value} checked={reason === r.value} onChange={() => setReason(r.value)} className="h-4 w-4 shrink-0 accent-[rgb(var(--brand))]" />
            <span className="min-w-0">
              <span className="block text-base">{r.label}</span>
              <span className="block text-xs text-fg-subtle">{r.hint}</span>
            </span>
          </label>
        ))}
        {reason && (
          <textarea className="input mt-2 min-h-[80px] resize-none" maxLength={300} placeholder={reason === 'other' ? 'Mô tả vấn đề (bắt buộc)' : 'Mô tả thêm (không bắt buộc)'} value={note} onChange={(e) => setNote(e.target.value)} />
        )}
      </fieldset>
    </Modal>
  );
}
