const crypto = require('crypto');
const User = require('../models/User');
const jwt = require('jsonwebtoken');

// Giới hạn số phiên đăng nhập lưu trên mỗi user (tránh mảng refreshTokens phình mãi)
const MAX_SESSIONS = 10;
const generateTokens = (userId, role) => {
  const accessToken = jwt.sign({ sub: userId, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' });
  // jwtid ngẫu nhiên: 2 lần đăng nhập trong cùng 1 giây vẫn ra 2 refresh token khác nhau
  const refreshToken = jwt.sign({ sub: userId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    jwtid: crypto.randomUUID(),
  });
  return { accessToken, refreshToken };
};

/**
 * Thêm refresh token mới bằng 1 lệnh cập nhật nguyên tử ($push + $slice giữ tối đa MAX_SESSIONS).
 * Không dùng user.save(): 2 request đăng nhập cùng lúc sẽ ghi đè mảng của nhau (VersionError).
 */
const addSession = (userId, refreshToken, extra = {}) =>
  User.updateOne(
    { _id: userId },
    { $push: { refreshTokens: { $each: [refreshToken], $slice: -MAX_SESSIONS } }, ...(Object.keys(extra).length && { $set: extra }) }
  );
exports.register = async (username, email, password) => {
  const normalizedEmail = String(email).trim().toLowerCase();
  // Không phân biệt hoa thường: "Alice" và "alice" coi là trùng
  const exists = await User.findOne({ $or: [{ email: normalizedEmail }, { username }] })
    .collation({ locale: 'en', strength: 2 });
  if (exists) throw Object.assign(new Error(exists.email === normalizedEmail ? 'Email đã được sử dụng' : 'Username đã tồn tại'), { statusCode: 409 });
  let user;
  try {
    user = await User.create({ username, email: normalizedEmail, password });
  } catch (err) {
    // 2 request đăng ký cùng lúc → unique index báo trùng
    if (err.code === 11000) throw Object.assign(new Error(err.keyPattern?.email ? 'Email đã được sử dụng' : 'Username đã tồn tại'), { statusCode: 409 });
    throw err;
  }
  const tokens = generateTokens(user._id, user.role);
  await addSession(user._id, tokens.refreshToken);
  return { user, ...tokens };
};
exports.login = async (email, password) => {
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password)))
    throw Object.assign(new Error('Email hoặc mật khẩu không đúng'), { statusCode: 401 });
  if (user.bannedAt)
    // Đúng mật khẩu rồi mới cho biết lý do khoá
    throw Object.assign(new Error(user.banReason ? `Tài khoản đã bị khoá. Lý do: ${user.banReason}` : 'Tài khoản đã bị khoá'), { statusCode: 403, code: 'banned' });
  const tokens = generateTokens(user._id, user.role);
  await addSession(user._id, tokens.refreshToken, { lastLoginAt: new Date() });
  return { user, ...tokens };
};
exports.refreshToken = async (token) => {
  if (!token) throw Object.assign(new Error('Refresh token required'), { statusCode: 401 });
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
  }
  // Gỡ token cũ một cách nguyên tử: 2 request dùng cùng 1 token thì chỉ 1 request thành công
  const user = await User.findOneAndUpdate(
    { _id: payload.sub, refreshTokens: token },
    { $pull: { refreshTokens: token } },
    { new: true }
  );
  if (!user) throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
  if (user.bannedAt)
    throw Object.assign(new Error('Tài khoản đã bị khoá'), { statusCode: 403 });
  const tokens = generateTokens(user._id, user.role);
  await addSession(user._id, tokens.refreshToken);
  return tokens;
};
exports.logout = async (userId, refreshToken) => {
  await User.findByIdAndUpdate(userId, { $pull: { refreshTokens: refreshToken } });
};
/**
 * Đổi mật khẩu: kiểm tra mật khẩu cũ (nếu tài khoản đã có), lưu mật khẩu mới (hook pre-save tự hash),
 * thu hồi toàn bộ phiên đăng nhập khác và cấp token mới cho phiên hiện tại.
 */
exports.changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId).select('+password');
  if (!user) throw Object.assign(new Error('Không tìm thấy người dùng'), { statusCode: 404 });
  if (user.password) {
    if (!currentPassword)
      throw Object.assign(new Error('Vui lòng nhập mật khẩu hiện tại'), { statusCode: 400 });
    if (!(await user.comparePassword(currentPassword)))
      throw Object.assign(new Error('Mật khẩu hiện tại không đúng'), { statusCode: 400 });
  }
  user.password = newPassword;
  await user.save();
  const tokens = generateTokens(user._id, user.role);
  // Đăng xuất mọi thiết bị khác: thay toàn bộ refreshTokens bằng token mới
  await User.updateOne({ _id: user._id }, { $set: { refreshTokens: [tokens.refreshToken] } });
  return tokens;
};
// ── Đăng nhập Google ────────────────────────────────────────────────────────

const { RESERVED_USERNAMES } = require('../validators/user.validator');

/** Bỏ dấu tiếng Việt + ký tự lạ → chỉ còn chữ, số, "_" (đúng quy tắc username) */
const slugify = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .toLowerCase();

/**
 * Tạo username hợp lệ, chưa ai dùng (không phân biệt hoa thường), từ email/tên Google.
 * VD: "Vũ Lê Hoàng" / vipboy.x555@gmail.com → "vipboy_x555", trùng thì "vipboy_x555_2", ...
 */
async function makeUsername(...candidates) {
  let base = candidates.map(slugify).find((c) => c.length >= 3) || 'user';
  base = base.slice(0, 24);
  if (base.length < 3) base = `${base}user`.slice(0, 24);
  if (RESERVED_USERNAMES.has(base)) base = `${base}_1`;
  for (let i = 0; i < 20; i += 1) {
    const name = i === 0 ? base : `${base}_${i < 10 ? i + 1 : crypto.randomBytes(2).toString('hex')}`;
    // eslint-disable-next-line no-await-in-loop
    const taken = await User.exists({ username: name }).collation({ locale: 'en', strength: 2 });
    if (!taken) return name;
  }
  return `user_${crypto.randomBytes(4).toString('hex')}`;
}
exports._makeUsername = makeUsername;

/**
 * Đăng nhập / đăng ký bằng tài khoản Google (profile từ passport-google-oauth20).
 * - Đã từng đăng nhập Google → dùng lại tài khoản đó.
 * - Email đã có tài khoản thường → liên kết Google vào tài khoản đó (chỉ khi Google xác nhận email).
 * - Chưa có → tạo tài khoản mới (không có mật khẩu).
 */
exports.googleAuth = async (profile) => {
  const googleId = profile?.id;
  const emailEntry = profile?.emails?.[0];
  const email = String(emailEntry?.value || '').trim().toLowerCase();
  const emailVerified = emailEntry?.verified === true || emailEntry?.verified === 'true' || profile?._json?.email_verified === true;
  if (!googleId || !email) throw Object.assign(new Error('Google không trả về email'), { statusCode: 400, code: 'no_email' });

  let user = await User.findOne({ googleId });
  if (!user) {
    const byEmail = await User.findOne({ email });
    if (byEmail) {
      // Chỉ liên kết khi Google đã xác minh email, tránh chiếm tài khoản bằng email giả
      if (!emailVerified) throw Object.assign(new Error('Email Google chưa được xác minh'), { statusCode: 409, code: 'email_unverified' });
      if (byEmail.googleId && byEmail.googleId !== googleId) {
        throw Object.assign(new Error('Email này đã liên kết với tài khoản Google khác'), { statusCode: 409, code: 'email_linked' });
      }
      await User.updateOne({ _id: byEmail._id }, { $set: { googleId } });
      user = byEmail;
    } else {
      const avatarUrl = profile.photos?.[0]?.value || null;
      const displayName = String(profile.displayName || '').trim().slice(0, 30);
      for (let attempt = 0; attempt < 3 && !user; attempt += 1) {
        // eslint-disable-next-line no-await-in-loop
        const username = await makeUsername(email.split('@')[0], displayName);
        try {
          // eslint-disable-next-line no-await-in-loop
          user = await User.create({ googleId, email, username, displayName, avatarUrl });
        } catch (err) {
          if (err.code !== 11000) throw err;
          // Trùng email do 2 request cùng lúc → lấy tài khoản vừa tạo; trùng username → thử tên khác
          // eslint-disable-next-line no-await-in-loop
          if (err.keyPattern?.email) user = await User.findOne({ email });
        }
      }
      if (!user) throw Object.assign(new Error('Không tạo được tài khoản'), { statusCode: 500 });
    }
  }

  if (user.bannedAt) throw Object.assign(new Error('Tài khoản đã bị khoá'), { statusCode: 403, code: 'banned' });
  const tokens = generateTokens(user._id, user.role);
  await addSession(user._id, tokens.refreshToken, { lastLoginAt: new Date() });
  return { user, ...tokens };
};
