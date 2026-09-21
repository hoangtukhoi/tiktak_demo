const multer = require('multer');
const logger = require('../utils/logger');

const notFoundMiddleware = (req, res) => {
  res.status(404).json({ success: false, message: `Không tìm thấy endpoint ${req.method} ${req.originalUrl}` });
};

const errorMiddleware = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  const status = err.statusCode || err.status;
  if (!status || status >= 500) logger.error(err);
  else logger.warn(`${req.method} ${req.originalUrl} -> ${status}: ${err.message}`);

  if (err instanceof multer.MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE' ? 'File vượt quá dung lượng cho phép' : `Lỗi upload: ${err.message}`;
    return res.status(400).json({ success: false, message });
  }
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Dữ liệu không hợp lệ',
      errors: Object.values(err.errors || {}).map((e) => e.message),
    });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'ID không đúng định dạng' });
  }
  if (err.code === 11000) {
    return res.status(409).json({ success: false, message: 'Dữ liệu đã tồn tại' });
  }
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ success: false, message: 'Token không hợp lệ hoặc đã hết hạn' });
  }

  res.status(status || 500).json({
    success: false,
    message: status && status < 500 ? err.message : 'Lỗi máy chủ',
  });
};

module.exports = { errorMiddleware, notFoundMiddleware };
