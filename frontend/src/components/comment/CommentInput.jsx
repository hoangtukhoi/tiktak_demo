import { useEffect, useRef, useState } from 'react';
import { ArrowUp, X } from 'lucide-react';
import Avatar from '../common/Avatar';

const QUICK = ['🔥', '😂', '😍', '👏', '🥹', '💯'];

export default function CommentInput({ user, onSubmit, replyTo, onCancelReply, disabled }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (replyTo) ref.current?.focus(); }, [replyTo]);

  const submit = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try { await onSubmit(t); setText(''); } finally { setSending(false); }
  };

  return (
    <form onSubmit={submit} className="border-t border-ink-600 bg-ink-800 pt-3">
      {replyTo && (
        <div className="mb-2 flex items-center justify-between rounded-xl bg-ink-700 px-3 py-1.5 text-xs text-paper-dim">
          Trả lời <b className="text-paper">@{replyTo.user.username}</b>
          <button type="button" onClick={onCancelReply} aria-label="Huỷ trả lời"><X size={14} /></button>
        </div>
      )}
      {!disabled && (
        <div className="mb-2 flex gap-1">
          {QUICK.map((e) => (
            <button key={e} type="button" onClick={() => setText((t) => t + e)} className="rounded-full px-2 py-1 text-lg transition hover:scale-125 hover:bg-ink-700">{e}</button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        {user && <Avatar user={user} size={32} />}
        <input
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          disabled={disabled}
          placeholder={disabled ? 'Đăng nhập để bình luận' : 'Thêm bình luận…'}
          className="input !rounded-full !py-2.5"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending || disabled}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lime text-ink transition duration-300 ease-spring enabled:hover:-rotate-12 disabled:bg-ink-600 disabled:text-paper-mute"
          aria-label="Gửi"
        >
          <ArrowUp size={20} strokeWidth={2.6} />
        </button>
      </div>
    </form>
  );
}
