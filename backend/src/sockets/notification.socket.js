const jwt = require('jsonwebtoken');
let ioInstance;
exports.initSocket = (io) => {
  ioInstance = io;
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
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
};
exports.emitToUser = (userId, event, data) => {
  if (!ioInstance) return;
  ioInstance.to(`user:${userId}`).emit(event, data);
};