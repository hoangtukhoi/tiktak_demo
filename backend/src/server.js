require('dotenv').config();
require('./config/env'); // ← validate biến môi trường, crash ngay nếu thiếu
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/database');
const redis = require('./config/redis');
const { initSocket } = require('./sockets/notification.socket');
const { startTranscodeWorker } = require('./jobs/transcodeVideo.job');
const { startDubbingWorker } = require('./jobs/generateDubbing.job');
const storageService = require('./services/storage.service');

const PORT = process.env.PORT || 5000;

async function main() {
  if (typeof connectDB === 'function') await connectDB().catch(console.error);
  if (redis.status === 'wait') await redis.connect().catch(console.error);
  if (typeof storageService.ensureBuckets === 'function') await storageService.ensureBuckets().catch(console.error);

  const server = http.createServer(app);
  const socketOrigins = (process.env.FRONTEND_URL || '').split(',').map((o) => o.trim()).filter(Boolean);
  const io = new Server(server, { cors: { origin: socketOrigins, credentials: true } });
  initSocket(io);

  // Mặc định chạy worker chung process cho tiện dev.
  // Khi chạy riêng `npm run worker`, đặt RUN_WORKERS_IN_API=false để tránh 2 nơi cùng xử lý job.
  if (process.env.RUN_WORKERS_IN_API !== 'false') {
    startTranscodeWorker();
    startDubbingWorker();
  }

  server.listen(PORT, () => {
    console.log(` Server running on http://localhost:${PORT}`);
  });
}
main().catch(err => { console.error(err); process.exit(1); });