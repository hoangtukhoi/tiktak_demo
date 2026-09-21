/**
 * Tiến trình worker độc lập.
 * Dùng khi muốn tách phần xử lý nặng (transcode, lồng tiếng) khỏi API server:
 * đặt RUN_WORKERS_IN_API=false rồi chạy `npm run worker`.
 */
const { assertEnv } = require('./config/env');
const connectDB = require('./config/database');
const redis = require('./config/redis');
const storageService = require('./services/storage.service');
const { startTranscodeWorker } = require('./jobs/transcodeVideo.job');
const { startDubbingWorker } = require('./jobs/generateDubbing.job');
const logger = require('./utils/logger');

async function main() {
  assertEnv();
  await connectDB();
  await redis.connect().catch(() => {});
  await storageService.ensureBuckets();

  const workers = [startTranscodeWorker(), startDubbingWorker()];
  logger.info('Worker đã sẵn sàng, đang chờ job');

  const shutdown = async () => {
    await Promise.all(workers.map((w) => w.close().catch(() => {})));
    await redis.quit().catch(() => {});
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
