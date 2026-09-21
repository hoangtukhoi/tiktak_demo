const rateLimit = require('express-rate-limit');

const common = {
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau' },
};

// Bỏ qua giới hạn cho SSE tiến trình vì client giữ kết nối dài.
const apiLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  max: 500,
  skip: (req) => req.path.endsWith('/progress'),
});

const authLimiter = rateLimit({ ...common, windowMs: 15 * 60 * 1000, max: 20 });
const uploadLimiter = rateLimit({ ...common, windowMs: 60 * 60 * 1000, max: 20 });
const dubbingLimiter = rateLimit({ ...common, windowMs: 60 * 60 * 1000, max: 30 });

module.exports = { apiLimiter, authLimiter, uploadLimiter, dubbingLimiter };
