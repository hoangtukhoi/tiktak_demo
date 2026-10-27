const logger = require('../utils/logger');
exports.errorMiddleware = (err, req, res, next) => {
  // Chỉ log lỗi server; lỗi 4xx là lỗi phía client
  if (!err.statusCode || err.statusCode >= 500) logger.error(err);
  if (err.name === 'ValidationError') return res.status(400).json({ success: false, message: err.message });
  if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid ID format' });
  if (err.code === 11000) return res.status(409).json({ success: false, message: 'Duplicate key error' });
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') return res.status(401).json({ success: false, message: 'Invalid token' });
  if (err.name === 'MulterError') return res.status(400).json({ success: false, message: err.message });
  const status = err.statusCode || 500;
  // Không lộ chi tiết lỗi nội bộ ra ngoài khi chạy production
  const message = status >= 500 && process.env.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : err.message || 'Internal Server Error';
  res.status(status).json({ success: false, message });
};