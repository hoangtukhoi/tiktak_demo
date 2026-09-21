const http = require('http');
const { Server } = require('socket.io');

const { env, assertEnv } = require('./config/env');
const app = require('./app');
const connectDB = require('./config/database');
const redis = require('./config/redis');
const storageService = require('./services/storage.service');
const transcodeService = require('./services/transcode.service');
const { initSocket } = require('./sockets/notification.socket');
const { startTranscodeWorker } = require('./jobs/transcodeVideo.job');
const { startDubbingWorker } = require('./jobs/generateDubbing.job');
const { closeQueues } = require('./jobs/queue');
const logger = require('./utils/logger');

async function main() {
  assertEnv();

  await connectDB();
  await redis.connect().catch((err) => logger.error(`Không kết nối được Redis: ${err.message}`));
  await storageService.ensureBuckets();

  if (!(await transcodeService.checkFfmpegAvailable())) {
    logger.warn('Không tìm thấy ffmpeg. Chức năng transcode và lồng tiếng sẽ không chạy được.');
  }

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: [env.FRONTEND_URL], credentials: true },
  });
  initSocket(io);

  const workers = [];
  if (env.RUN_WORKERS_IN_API) {
    workers.push(startTranscodeWorker(), startDubbingWorker());
    logger.info('Worker transcode và dubbing chạy chung tiến trình API');
  }

  server.listen(env.PORT, () => logger.info(`Server chạy tại http://localhost:${env.PORT}`));

  const shutdown = async (signal) => {
    logger.info(`Nhận ${signal}, đang tắt server`);
    server.close();
    await Promise.all(workers.map((w) => w.close().catch(() => {})));
    await closeQueues().catch(() => {});
    await redis.quit().catch(() => {});
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
