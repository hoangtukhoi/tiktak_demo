const rateLimit = require('express-rate-limit');

const isProd = process.env.NODE_ENV === 'production';

// Các request "nhẹ", gọi lặp lại theo thiết kế (đếm view, polling trạng thái, SSE)
// không tính vào giới hạn chung — nếu tính, người dùng lướt feed vài phút là bị 429.
const LIGHT_ROUTES = [
  /^\/videos\/[^/]+\/view$/,
  /^\/notifications\/unread-count$/,
  /^\/dubbing\/[^/]+\/status$/,
  /^\/upload\/[^/]+\/progress$/,
];

exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT) || (isProd ? 1000 : 5000),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => LIGHT_ROUTES.some((re) => re.test(req.path)),
  message: { success: false, message: 'Bạn gửi quá nhiều yêu cầu, thử lại sau ít phút' },
});

// Riêng đếm view: chặn spam nhưng vẫn rộng rãi
exports.viewLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests' },
});

exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isProd ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Thử đăng nhập/đăng ký quá nhiều lần, thử lại sau 15 phút' },
});

exports.uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Bạn đã tải lên quá nhiều video, thử lại sau' },
});
