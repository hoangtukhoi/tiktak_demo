const jwt = require('jsonwebtoken');
const redis = require('../config/redis');

// Kênh Redis để process worker (không có Socket.IO) nhờ API server emit hộ
const CHANNEL = 'socket:emit';
let ioInstance;
let subscriber;

exports.initSocket = (io) => {
  ioInstance = io;
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.sub;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });
  io.on('connection', (socket) => {
    socket.join(`user:${socket.userId}`);
    console.log(`[Socket] Connected: user ${socket.userId}`);
    socket.on('disconnect', () => console.log(`[Socket] Disconnected: user ${socket.userId}`));
  });

  // Nhận sự kiện do worker publish rồi đẩy tới client
  subscriber = redis.duplicate();
  subscriber.on('error', (err) => console.error('[Socket] Redis subscriber error:', err.message));
  subscriber.on('message', (channel, raw) => {
    if (channel !== CHANNEL) return;
    try {
      const { userId, event, data } = JSON.parse(raw);
      ioInstance.to(`user:${userId}`).emit(event, data);
    } catch (err) {
      console.error('[Socket] Invalid relay message:', err.message);
    }
  });
  subscriber.subscribe(CHANNEL).catch((err) =>
    console.error('[Socket] Subscribe failed:', err.message)
  );
};

exports.emitToUser = (userId, event, data) => {
  if (!userId) return;
  if (ioInstance) {
    ioInstance.to(`user:${userId}`).emit(event, data);
    return;
  }
  // Đang chạy trong worker riêng (npm run worker) → chuyển qua Redis
  redis
    .publish(CHANNEL, JSON.stringify({ userId: String(userId), event, data }))
    .catch((err) => console.error('[Socket] Publish failed:', err.message));
};
