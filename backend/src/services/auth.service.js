const User = require('../models/User');
const jwt = require('jsonwebtoken');
const generateTokens = (userId, role) => {
  const accessToken = jwt.sign({ sub: userId, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '1h' });
  const refreshToken = jwt.sign({ sub: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
  return { accessToken, refreshToken };
};
exports.register = async (username, email, password) => {
  const exists = await User.findOne({ $or: [{ email }, { username }] });
  if (exists) throw Object.assign(new Error(exists.email === email ? 'Email đã được sử dụng' : 'Username đã tồn tại'), { statusCode: 409 });
  const user = await User.create({ username, email, password });
  const tokens = generateTokens(user._id, user.role);
  user.refreshTokens = user.refreshTokens || [];
  user.refreshTokens.push(tokens.refreshToken);
  await user.save({ validateBeforeSave: false });
  return { user, ...tokens };
};
exports.login = async (email, password) => {
  const user = await User.findOne({ email }).select('+password +refreshTokens');
  if (!user || !(await user.comparePassword(password)))
    throw Object.assign(new Error('Email hoặc mật khẩu không đúng'), { statusCode: 401 });
  if (user.bannedAt)
    throw Object.assign(new Error('Tài khoản đã bị khoá'), { statusCode: 403 });
  const tokens = generateTokens(user._id, user.role);
  user.refreshTokens = user.refreshTokens || [];
  user.refreshTokens.push(tokens.refreshToken);
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });
  return { user, ...tokens };
};
exports.refreshToken = async (token) => {
  if (!token) throw Object.assign(new Error('Refresh token required'), { statusCode: 401 });
  const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user || !user.refreshTokens.includes(token))
    throw Object.assign(new Error('Invalid refresh token'), { statusCode: 401 });
  const tokens = generateTokens(user._id, user.role);
  user.refreshTokens = user.refreshTokens.filter(t => t !== token);
  user.refreshTokens.push(tokens.refreshToken);
  await user.save({ validateBeforeSave: false });
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