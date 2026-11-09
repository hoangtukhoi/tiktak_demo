import { useEffect, useRef, useState } from 'react';
import { ArrowUp, X } from 'lucide-react';

const QUICK = ['😂', '😍', '🔥', '👏', '🥹', '😮'];

export default function CommentInput({ onSubmit, replyTo, onCancelReply, disabled }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (replyTo) ref.current?.focus(); }, [replyTo]);

  const submit = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try { await onSubmit(t); setText(''); } catch { /* đã báo lỗi */ } finally { setSending(false); }
  };

  return (
    <form onSubmit={submit} className="border-t border-line bg-surface px-4 pb-3 pt-2">
      {replyTo && (
        <div className="mb-2 flex items-center justify-between text-xs text-fg-muted">
          <span>Trả lời <b className="text-fg">{replyTo.user.username}</b></span>
          <button type="button" onClick={onCancelReply} className="icon-btn !h-6 !w-6" aria-label="Huỷ trả lời"><X size={14} /></button>
        </div>
      )}
      {!disabled && (
        <div className="mb-1.5 flex gap-0.5">
          {QUICK.map((e) => <button key={e} type="button" onClick={() => setText((t) => t + e)} className="rounded px-1.5 py-0.5 text-lg hover:bg-surface-2" aria-label={`Chèn ${e}`}>{e}</button>)}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input ref={ref} value={text} onChange={(e) => setText(e.target.value)} maxLength={500} disabled={disabled}
          placeholder={disabled ? 'Đăng nhập để bình luận' : replyTo ? 'Viết câu trả lời…' : 'Thêm bình luận…'} className="input !h-11 !rounded-full !bg-surface-2 !border-transparent" />
        <button type="submit" disabled={!text.trim() || sending || disabled} aria-label="Gửi"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand text-white transition-colors hover:bg-brand-hover disabled:bg-surface-2 disabled:text-fg-subtle">
          <ArrowUp size={19} strokeWidth={2.4} />
        </button>
      </div>
    </form>
  );
}
