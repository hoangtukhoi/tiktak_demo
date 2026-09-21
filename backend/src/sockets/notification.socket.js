const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const logger = require('../utils/logger');

let ioInstance = null;

/**
 * Gắn xác thực JWT vào handshake và cho mỗi user một room riêng
 * để server có thể đẩy sự kiện tới đúng người nhận.
 */
function initSocket(io) {
  ioInstance = io;

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Thiếu token'));
    try {
      const payload = jwt.verify(token, env.JWT_SECRET);
      socket.userId = payload.sub;
      return next();
    } catch (err) {
      return next(new Error('Token không hợp lệ'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    logger.info(`[socket] user ${socket.userId} đã kết nối`);

    // Cho phép client theo dõi tiến trình của một video cụ thể.
    socket.on('video:subscribe', (videoId) => {
      if (typeof videoId === 'string') socket.join(`video:${videoId}`);
    });
    socket.on('video:unsubscribe', (videoId) => {
      if (typeof videoId === 'string') socket.leave(`video:${videoId}`);
    });

    socket.on('disconnect', () => logger.info(`[socket] user ${socket.userId} ngắt kết nối`));
  });

  return io;
}

function emitToUser(userId, event, data) {
  if (!ioInstance || !userId) return false;
  ioInstance.to(`user:${userId}`).emit(event, data);
  return true;
}

function emitToVideo(videoId, event, data) {
  if (!ioInstance || !videoId) return false;
  ioInstance.to(`video:${videoId}`).emit(event, data);
  return true;
}

function getIO() {
  return ioInstance;
}

module.exports = { initSocket, emitToUser, emitToVideo, getIO };
