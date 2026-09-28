/**
 * worker.js — Entry point riêng cho BullMQ workers
 * Chạy: node src/worker.js   hoặc   npm run worker
 *
 * Tách khỏi server.js để có thể scale worker độc lập
 */

require('dotenv').config();
require('./config/env'); // validate env vars

const redis = require('./config/redis');
const { startTranscodeWorker } = require('./jobs/transcodeVideo.job');
const { startDubbingWorker }   = require('./jobs/generateDubbing.job');

async function startWorkers() {
  console.log('🔄 [Worker] Connecting to Redis...');
  await redis.connect().catch((err) => {
    console.error('❌ [Worker] Redis connection failed:', err.message);
    process.exit(1);
  });
  console.log('✅ [Worker] Redis connected');

  startTranscodeWorker();
  startDubbingWorker();

  console.log('✅ [Worker] BullMQ workers started:');
  console.log('   - video-transcode');
  console.log('   - video-dubbing');
  console.log('\n⏳ Waiting for jobs...\n');
}

startWorkers().catch((err) => {
  console.error('❌ [Worker] Fatal error:', err.message);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n[Worker] SIGTERM received, shutting down...');
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n[Worker] SIGINT received, shutting down...');
  await redis.quit();
  process.exit(0);
});
