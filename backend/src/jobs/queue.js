const { Queue } = require('bullmq');
const redis = require('../config/redis');

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 10000 },
  removeOnComplete: { age: 24 * 3600, count: 500 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

const transcodeQueue = new Queue('video-transcode', { connection: redis, defaultJobOptions });
const dubbingQueue = new Queue('video-dubbing', { connection: redis, defaultJobOptions });

console.log('Queues initialized: video-transcode, video-dubbing');

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

module.exports = {
  transcodeQueue,
  dubbingQueue,
  setProgress,
  getProgress,
};