const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { env } = require('../config/env');

const extractToken = (req) => {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return req.query?.token || null;
};

const unauthorized = (res, message) => res.status(401).json({ success: false, message });

/** Bắt buộc đăng nhập. Chặn luôn tài khoản đang bị khoá. */
const authenticate = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return unauthorized(res, 'Bạn cần đăng nhập');

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(decoded.sub);
    if (!user) return unauthorized(res, 'Tài khoản không tồn tại');
    if (user.bannedAt) {
      return res.status(403).json({
        success: false,
        message: `Tài khoản đã bị khoá: ${user.banReason || 'vi phạm tiêu chuẩn cộng đồng'}`,
      });
    }
    req.user = user;
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Phiên đăng nhập đã hết hạn' : 'Token không hợp lệ';
    return unauthorized(res, message);
  }
};

/** Gắn req.user nếu có token hợp lệ, nhưng không chặn khách vãng lai. */
const optionalAuth = async (req, res, next) => {
  const token = extractToken(req);
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    const user = await User.findById(decoded.sub);
    if (user && !user.bannedAt) req.user = user;
  } catch (err) {
    // Bỏ qua: coi như khách chưa đăng nhập.
  }
  return next();
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return unauthorized(res, 'Bạn cần đăng nhập');
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập' });
  }
  return next();
};

/** Dùng cho endpoint nội bộ mà AI service gọi ngược lại. */
const requireInternalKey = (req, res, next) => {
  if (req.headers['x-internal-key'] !== env.INTERNAL_KEY) {
    return res.status(403).json({ success: false, message: 'Internal key không hợp lệ' });
  }
  return next();
};

module.exports = { authenticate, optionalAuth, requireRole, requireInternalKey };
