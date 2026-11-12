import { Fragment } from 'react';
import { Link } from 'react-router-dom';

// @username: 3–30 ký tự chữ/số/_ và không dính liền sau chữ (VD email a@b.com) — khớp backend utils/mentions.js
// #hashtag: chữ (kể cả có dấu), số, _
const TOKEN_RE = /(^|[^a-zA-Z0-9_@])(@[a-zA-Z0-9_]{3,30})(?![a-zA-Z0-9_])|(#[\p{L}\p{N}_]+)/gu;

/**
 * Hiển thị văn bản có @tag và #hashtag thành link.
 * mentions (từ backend) chỉ dùng để biết tag nào là người thật → tag không tồn tại hiện như chữ thường.
 */
export default function RichText({ text, mentions, className = '', linkClassName = 'font-bold text-brand-text hover:underline' }) {
  if (!text) return null;
  const known = mentions ? new Set(mentions.map((m) => m.username?.toLowerCase())) : null;
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const [whole, before = '', mention, tag] = m;
    const start = m.index + before.length;
    if (start > last) parts.push(text.slice(last, start));
    if (mention) {
      const name = mention.slice(1);
      if (!known || known.has(name.toLowerCase())) {
        parts.push(
          <Link key={start} to={`/profile/${name}`} onClick={(e) => e.stopPropagation()} className={linkClassName}>
            {mention}
          </Link>
        );
      } else parts.push(mention);
    } else if (tag) {
      parts.push(
        <Link key={start} to={`/search?q=${encodeURIComponent(tag)}`} onClick={(e) => e.stopPropagation()} className={linkClassName}>
          {tag}
        </Link>
      );
    }
    last = m.index + whole.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</span>;
}
