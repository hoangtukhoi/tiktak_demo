const { Queue } = require('bullmq');
const redis = require('../config/redis');
const { QUEUES } = require('../utils/constants');

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10000 },
  removeOnComplete: { age: 24 * 3600, count: 500 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

const transcodeQueue = new Queue(QUEUES.TRANSCODE, { connection: redis, defaultJobOptions });
const dubbingQueue = new Queue(QUEUES.DUBBING, { connection: redis, defaultJobOptions });

/**
 * Tiến trình job được ghi vào Redis để endpoint SSE ở tiến trình API
 * vẫn đọc được dù worker chạy ở tiến trình khác.
 */
const progressKey = (jobId) => `job:progress:${jobId}`;

async function setProgress(jobId, data) {
  if (!jobId) return;
  const payload = JSON.stringify({ ...data, updatedAt: Date.now() });
  await redis.set(progressKey(jobId), payload, 'EX', 24 * 3600);
}

async function getProgress(jobId) {
  const raw = await redis.get(progressKey(jobId));
  return raw ? JSON.parse(raw) : null;
}

async function closeQueues() {
  await Promise.all([transcodeQueue.close(), dubbingQueue.close()]);
}

module.exports = {
  transcodeQueue,
  dubbingQueue,
  setProgress,
  getProgress,
  closeQueues,
  defaultJobOptions,
};
