/**
 * Tag tên (@username) trong bình luận và mô tả video.
 *
 * - Username hợp lệ: 3–30 ký tự chữ/số/_ (khớp User.username)
 * - Không nhận "@" dính liền sau chữ/số (VD email a@b.com không phải tag)
 * - Mỗi nội dung tối đa MAX_MENTIONS người được tag (chống spam thông báo)
 */
const User = require('../models/User');

const MAX_MENTIONS = 10;
const MENTION_RE = /(^|[^a-zA-Z0-9_@])@([a-zA-Z0-9_]{3,30})(?![a-zA-Z0-9_])/g;

/** Trả về danh sách username (không trùng, không phân biệt hoa thường) theo thứ tự xuất hiện */
function extractMentionUsernames(text, max = MAX_MENTIONS) {
  if (typeof text !== 'string' || !text.includes('@')) return [];
  const seen = new Set();
  const out = [];
  for (const m of text.matchAll(MENTION_RE)) {
    const key = m[2].toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m[2]);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Tìm user thật được tag trong nội dung.
 * @returns {Promise<Array<{ userId, username }>>}
 */
async function resolveMentions(text, { excludeIds = [], authorId = excludeIds[0] } = {}) {
  const names = extractMentionUsernames(text);
  if (!names.length) return [];
  const users = await User.find({ username: { $in: names }, bannedAt: null })
    .collation({ locale: 'en', strength: 2 })
    .select('_id username')
    .lean();
  const exclude = new Set(excludeIds.filter(Boolean).map(String));
  const found = users
    .filter((u) => !exclude.has(String(u._id)))
    .map((u) => ({ userId: u._id, username: u.username }));
  // Tôn trọng cài đặt "Ai được tag tôi" và chặn
  if (!authorId || !found.length) return found;
  return require('../services/privacy.service').filterMentions(found, authorId);
}

module.exports = { extractMentionUsernames, resolveMentions, MAX_MENTIONS };
