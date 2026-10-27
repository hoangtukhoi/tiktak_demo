const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  return scheme && scheme.toLowerCase() === 'bearer' && token ? token : null;
};

exports.authenticate = async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.sub);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    // Tài khoản bị khoá thì access token cũ cũng không dùng được nữa
    if (user.bannedAt) return res.status(403).json({ success: false, message: 'Tài khoản đã bị khoá' });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

exports.optionalAuth = async (req, res, next) => {
  try {
    const token = getBearerToken(req);
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.sub);
      if (user && !user.bannedAt) req.user = user;
    }
  } catch (err) {
    // token sai/hết hạn → coi như khách
  }
  next();
};

exports.requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  next();
};

/**
 * Bảo vệ các endpoint nội bộ (pipeline / AI service gọi vào).
 * Client phải gửi header `x-internal-key` trùng với INTERNAL_KEY trong .env.
 */
exports.requireInternalKey = (req, res, next) => {
  const expected = process.env.INTERNAL_KEY;
  const provided = req.headers['x-internal-key'];
  if (!expected || typeof provided !== 'string') {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }
  next();
};
