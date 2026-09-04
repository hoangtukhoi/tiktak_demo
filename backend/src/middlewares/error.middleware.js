const logger = require('../utils/logger');
exports.errorMiddleware = (err, req, res, next) => {
  logger.error(err);
  if (err.name === 'ValidationError') return res.status(400).json({ success: false, message: err.message });
  if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid ID format' });
  if (err.code === 11000) return res.status(409).json({ success: false, message: 'Duplicate key error' });
  if (err.name === 'JsonWebTokenError') return res.status(401).json({ success: false, message: 'Invalid token' });
  res.status(err.statusCode || 500).json({ success: false, message: err.message || 'Internal Server Error' });
};