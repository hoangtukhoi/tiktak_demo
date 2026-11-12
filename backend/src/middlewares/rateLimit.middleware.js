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

/**
 * Giới hạn riêng cho thao tác tương tác (bình luận, theo dõi, thích, báo cáo...) — đếm theo tài khoản,
 * để 1 tài khoản / bot không spam được dù giới hạn chung còn rộng.
 * Tắt khi chạy test (NODE_ENV=test) trừ khi đặt RATE_LIMIT_IN_TEST=true.
 */
const perUser = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req.user ? `u:${req.user._id}` : req.ip),
    skip: () => process.env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TEST !== 'true',
    message: { success: false, message },
  });

// Bình luận: 12 / phút
exports.commentLimiter = perUser({ windowMs: 60 * 1000, max: Number(process.env.COMMENT_RATE_LIMIT) || 12, message: 'Bạn bình luận quá nhanh, chờ một chút rồi thử lại' });
// Theo dõi / bỏ theo dõi / chặn: 30 / phút
exports.followLimiter = perUser({ windowMs: 60 * 1000, max: Number(process.env.FOLLOW_RATE_LIMIT) || 30, message: 'Bạn thao tác quá nhanh, chờ một chút rồi thử lại' });
// Thích, lưu, đăng lại, ghim: 90 / phút
exports.reactionLimiter = perUser({ windowMs: 60 * 1000, max: Number(process.env.REACTION_RATE_LIMIT) || 90, message: 'Bạn thao tác quá nhanh, chờ một chút rồi thử lại' });
// Báo cáo: 10 / 10 phút
exports.reportLimiter = perUser({ windowMs: 10 * 60 * 1000, max: Number(process.env.REPORT_RATE_LIMIT) || 10, message: 'Bạn gửi quá nhiều báo cáo, thử lại sau ít phút' });

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
