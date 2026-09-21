const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const { env } = require('../config/env');

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });
const MAX_SESSIONS = 5;

function generateTokens(userId, role) {
  const accessToken = jwt.sign({ sub: String(userId), role }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });
  const refreshToken = jwt.sign(
    { sub: String(userId), jti: crypto.randomUUID() },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES_IN }
  );
  return { accessToken, refreshToken };
}

/** Giữ tối đa MAX_SESSIONS refresh token, token cũ nhất bị loại. */
async function pushRefreshToken(user, refreshToken) {
  const tokens = [...(user.refreshTokens || []), refreshToken].slice(-MAX_SESSIONS);
  user.refreshTokens = tokens;
  await user.save({ validateBeforeSave: false });
}

async function register(username, email, password) {
  const exists = await User.findOne({ $or: [{ email }, { username }] });
  if (exists) {
    throw httpError(exists.email === email ? 'Email đã được sử dụng' : 'Username đã tồn tại', 409);
  }

  const user = await User.create({ username, email, password });
  const tokens = generateTokens(user._id, user.role);
  await pushRefreshToken(user, tokens.refreshToken);
  return { user: user.toJSON(), ...tokens };
}

async function login(email, password) {
  const user = await User.findOne({ email }).select('+password +refreshTokens');
  if (!user || !user.password || !(await user.comparePassword(password))) {
    throw httpError('Email hoặc mật khẩu không đúng', 401);
  }
  if (user.bannedAt) {
    throw httpError(`Tài khoản đã bị khoá: ${user.banReason || 'vi phạm tiêu chuẩn cộng đồng'}`, 403);
  }

  const tokens = generateTokens(user._id, user.role);
  user.lastLoginAt = new Date();
  await pushRefreshToken(user, tokens.refreshToken);
  return { user: user.toJSON(), ...tokens };
}

/**
 * Xoay vòng refresh token: token cũ bị vô hiệu ngay khi cấp token mới,
 * hạn chế thiệt hại nếu token bị lộ.
 */
async function refreshToken(token) {
  if (!token) throw httpError('Thiếu refresh token', 401);

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw httpError('Refresh token không hợp lệ hoặc đã hết hạn', 401);
  }

  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user || !(user.refreshTokens || []).includes(token)) {
    throw httpError('Refresh token đã bị thu hồi', 401);
  }
  if (user.bannedAt) throw httpError('Tài khoản đã bị khoá', 403);

  const tokens = generateTokens(user._id, user.role);
  user.refreshTokens = (user.refreshTokens || []).filter((t) => t !== token);
  await pushRefreshToken(user, tokens.refreshToken);
  return tokens;
}

async function logout(userId, token) {
  if (!token) return User.findByIdAndUpdate(userId, { refreshTokens: [] });
  return User.findByIdAndUpdate(userId, { $pull: { refreshTokens: token } });
}

async function googleAuth(googleId, email, username, avatarUrl) {
  let user = await User.findOne({ $or: [{ googleId }, { email }] }).select('+refreshTokens');

  if (!user) {
    let finalUsername = username;
    if (await User.exists({ username: finalUsername })) {
      finalUsername = `${username}_${crypto.randomBytes(2).toString('hex')}`;
    }
    user = await User.create({
      googleId,
      email,
      username: finalUsername,
      avatarUrl,
      isVerified: true,
    });
  } else if (!user.googleId) {
    user.googleId = googleId;
  }

  if (user.bannedAt) throw httpError('Tài khoản đã bị khoá', 403);

  const tokens = generateTokens(user._id, user.role);
  user.lastLoginAt = new Date();
  await pushRefreshToken(user, tokens.refreshToken);
  return { user: user.toJSON(), ...tokens };
}

module.exports = { register, login, refreshToken, logout, googleAuth, generateTokens };
