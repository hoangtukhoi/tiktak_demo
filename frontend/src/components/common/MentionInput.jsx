import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BadgeCheck } from 'lucide-react';
import Avatar from './Avatar';
import { mentionSuggest } from '../../api/video.api';
import { formatCount } from '../../utils/format';

// Đoạn "@abc" ngay trước con trỏ (chưa có dấu cách) → đang gõ tag
const ACTIVE_RE = /(^|[^a-zA-Z0-9_@])@([a-zA-Z0-9_]{0,30})$/;

/**
 * Ô nhập có gợi ý tag tên: gõ "@" → hiện danh sách người (ưu tiên người mình theo dõi).
 * ↑/↓ chọn, Enter/Tab để chèn, Esc để đóng.
 *
 * as="input" | "textarea"; placement="top" (mở lên trên, cho ô bình luận ở đáy) | "bottom"
 * Các props khác (placeholder, maxLength, disabled, className...) chuyển thẳng xuống ô nhập.
 */
const MentionInput = forwardRef(function MentionInput(
  { value, onChange, as = 'input', placement = 'top', onKeyDown, className = '', ...rest },
  ref
) {
  const el = useRef(null);
  useImperativeHandle(ref, () => el.current);
  const [query, setQuery] = useState(null); // null = không gõ tag
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);

  const detect = (text, caret) => {
    const m = ACTIVE_RE.exec(text.slice(0, caret));
    setQuery(m ? m[2] : null);
  };

  // Gọi API có độ trễ nhỏ để không gửi request mỗi phím
  useEffect(() => {
    if (query === null) { setItems([]); return undefined; }
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      mentionSuggest(query)
        .then((list) => { if (alive) { setItems(list); setActive(0); } })
        .catch(() => alive && setItems([]))
        .finally(() => alive && setLoading(false));
    }, 160);
    return () => { alive = false; clearTimeout(t); };
  }, [query]);

  const open = query !== null && (items.length > 0 || loading);

  const pick = (user) => {
    const input = el.current;
    const caret = input?.selectionStart ?? value.length;
    const before = value.slice(0, caret).replace(/@[a-zA-Z0-9_]*$/, `@${user.username} `);
    const next = before + value.slice(caret).replace(/^[a-zA-Z0-9_]+/, '');
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(before.length, before.length);
    });
  };

  const keyDown = (e) => {
    if (open && items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % items.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + items.length) % items.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(items[active]); return; }
    }
    if (open && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQuery(null); return; }
    onKeyDown?.(e);
  };

  const Field = as;
  return (
    <div className="relative w-full">
      <Field
        ref={el}
        value={value}
        onChange={(e) => { onChange(e.target.value); detect(e.target.value, e.target.selectionStart); }}
        onKeyDown={keyDown}
        onClick={(e) => detect(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        className={className}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        {...rest}
      />
      <AnimatePresence>
        {open && (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: placement === 'top' ? 6 : -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`absolute left-0 right-0 z-30 max-h-64 overflow-y-auto rounded-2xl border border-ink-600 bg-ink-800 p-1.5 shadow-2xl shadow-black/60 ${placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
          >
            {loading && !items.length && <li className="px-3 py-2.5 text-sm text-paper-mute">Đang tìm…</li>}
            {items.map((u, i) => (
              <li key={u._id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // giữ focus ở ô nhập
                  onClick={() => pick(u)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition ${i === active ? 'bg-ink-600' : ''}`}
                >
                  <Avatar user={u} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1 truncate text-sm font-bold">
                      {u.displayName || u.username}
                      {u.isVerified && <BadgeCheck size={13} className="shrink-0 text-lime" />}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-paper-mute">@{u.username} · {formatCount(u.followerCount || 0)} follower</span>
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
});

export default MentionInput;
