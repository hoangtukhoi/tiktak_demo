require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');
const app = require('./app');
const connectDB = require('./config/database');
const redis = require('./config/redis');
const { initSocket } = require('./sockets/notification.socket');
const { startTranscodeWorker } = require('./jobs/transcodeVideo.job');
const { startDubbingWorker } = require('./jobs/generateDubbing.job');

const PORT = process.env.PORT || 5000;

async function main() {
  if (typeof connectDB === 'function') await connectDB().catch(console.error);
  if (redis.connect && typeof redis.connect === 'function') await redis.connect().catch(console.error);

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: process.env.FRONTEND_URL, credentials: true } });
  initSocket(io);

  startTranscodeWorker();
  startDubbingWorker();

  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
}
main().catch(err => { console.error(err); process.exit(1); });