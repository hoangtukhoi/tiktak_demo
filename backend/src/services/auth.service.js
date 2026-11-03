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
    throw Object.assign(new Error('Tài khoản đã bị khoá'), { statusCode: 403 });
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
exports.googleAuth = async (googleId, email, username, avatarUrl) => {
  let user = await User.findOne({ $or: [{ googleId }, { email }] });
  if (!user) {
    let finalUsername = username;
    const taken = await User.findOne({ username });
    if (taken) finalUsername = `${username}_${Math.random().toString(36).slice(2, 6)}`;
    user = await User.create({ googleId, email, username: finalUsername, avatarUrl, isVerified: true });
  } else if (!user.googleId) {
    user.googleId = googleId;
    await user.save({ validateBeforeSave: false });
  }
  const tokens = generateTokens(user._id, user.role);
  await User.findByIdAndUpdate(user._id, { $push: { refreshTokens: tokens.refreshToken } });
  return { user, ...tokens };
};