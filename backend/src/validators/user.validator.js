const Joi = require('joi');

// Không cho đặt username trùng với các route tĩnh hoặc tên hệ thống
const RESERVED_USERNAMES = new Set([
  'me', 'search', 'admin', 'api', 'login', 'register', 'logout', 'upload', 'settings',
  'profile', 'following', 'explore', 'tiktak', 'support', 'help', 'root', 'system',
]);

const username = Joi.string()
  .trim()
  .min(3)
  .max(30)
  .pattern(/^[a-zA-Z0-9_]+$/)
  .custom((value, helpers) =>
    RESERVED_USERNAMES.has(value.toLowerCase()) ? helpers.error('username.reserved') : value
  )
  .messages({
    'string.min': 'Username phải có ít nhất 3 ký tự',
    'string.max': 'Username tối đa 30 ký tự',
    'string.pattern.base': 'Username chỉ gồm chữ không dấu, số và dấu gạch dưới (_)',
    'username.reserved': 'Username này đã được hệ thống giữ chỗ',
  });

const optionalLink = (label) =>
  Joi.string().trim().max(200).allow('', null).messages({ 'string.max': `${label} tối đa 200 ký tự` });

exports.updateProfileSchema = Joi.object({
  displayName: Joi.string().trim().max(30).allow('').messages({ 'string.max': 'Tên hiển thị tối đa 30 ký tự' }),
  username,
  bio: Joi.string().max(150).allow('').messages({ 'string.max': 'Tiểu sử tối đa 150 ký tự' }),
  // Chỉ cho phép xoá ảnh qua PATCH; đặt ảnh mới dùng POST /users/me/avatar
  avatarUrl: Joi.valid(null).messages({ 'any.only': 'Đổi ảnh đại diện bằng cách tải ảnh lên' }),
  links: Joi.object({
    website: optionalLink('Website'),
    instagram: optionalLink('Instagram'),
    youtube: optionalLink('YouTube'),
  }),
})
  .min(1)
  .messages({ 'object.min': 'Không có thông tin nào để cập nhật', 'object.unknown': 'Trường {#label} không được phép sửa' });

// ── Chuẩn hoá liên kết ───────────────────────────────────────────────────────

const toUrl = (raw) => {
  const v = String(raw || '').trim();
  if (!v) return '';
  const withProto = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  let url;
  try {
    url = new URL(withProto);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return null;
  return url.toString();
};

const hostMatches = (url, hosts) => {
  const h = new URL(url).hostname.toLowerCase().replace(/^www\.|^m\./, '');
  return hosts.some((d) => h === d || h.endsWith(`.${d}`));
};

/**
 * Nhận URL hoặc tên tài khoản (@abc) → trả URL đầy đủ, '' nếu bỏ trống.
 * Ném lỗi 400 nếu không hợp lệ.
 */
exports.normalizeLinks = (links = {}) => {
  const bad = (msg) => {
    throw Object.assign(new Error(msg), { statusCode: 400 });
  };
  const out = {};

  if (links.website !== undefined) {
    const url = toUrl(links.website);
    if (url === null) bad('Website không phải đường dẫn hợp lệ');
    out.website = url;
  }

  if (links.instagram !== undefined) {
    const v = String(links.instagram || '').trim();
    const handle = v.match(/^@?([a-zA-Z0-9._]{1,30})$/);
    const url = handle ? `https://www.instagram.com/${handle[1]}` : toUrl(v);
    if (url === null || (url && !hostMatches(url, ['instagram.com']))) {
      bad('Instagram: nhập @tên_tài_khoản hoặc link instagram.com');
    }
    out.instagram = url;
  }

  if (links.youtube !== undefined) {
    const v = String(links.youtube || '').trim();
    const handle = v.match(/^@([a-zA-Z0-9._-]{3,30})$/);
    const url = handle ? `https://www.youtube.com/@${handle[1]}` : toUrl(v);
    if (url === null || (url && !hostMatches(url, ['youtube.com', 'youtu.be']))) {
      bad('YouTube: nhập @kênh hoặc link youtube.com');
    }
    out.youtube = url;
  }

  return out;
};

exports.RESERVED_USERNAMES = RESERVED_USERNAMES;

// Đổi mật khẩu. currentPassword bỏ trống được với tài khoản Google chưa từng đặt mật khẩu
exports.changePasswordSchema = Joi.object({
  currentPassword: Joi.string().allow('').max(128),
  newPassword: Joi.string().min(6).max(128).required().invalid(Joi.ref('currentPassword')).messages({
    'string.min': 'Mật khẩu mới phải có ít nhất 6 ký tự',
    'string.max': 'Mật khẩu mới tối đa 128 ký tự',
    'any.required': 'Vui lòng nhập mật khẩu mới',
    'string.empty': 'Vui lòng nhập mật khẩu mới',
    'any.invalid': 'Mật khẩu mới phải khác mật khẩu hiện tại',
  }),
});
