const { Worker } = require('bullmq');

const { createRedisConnection } = require('../config/redis');
const { QUEUES } = require('../utils/constants');
const { runDubbingPipeline } = require('../services/ai/dubbingPipeline.service');
const { setProgress } = require('./queue');
const logger = require('../utils/logger');

async function processDubbingJob(job) {
  const { audioTrackId } = job.data;
  const track = await runDubbingPipeline(audioTrackId, async (percent, message) => {
    await job.updateProgress(percent);
    await setProgress(job.id, { status: 'processing', percent, message, audioTrackId });
  });
  await setProgress(job.id, {
    status: 'completed',
    percent: 100,
    message: 'Hoàn tất',
    audioTrackId,
    audioUrl: track.audioUrl,
    subtitleUrl: track.subtitleUrl,
  });
  return { audioTrackId, audioUrl: track.audioUrl };
}

function startDubbingWorker() {
  const worker = new Worker(QUEUES.DUBBING, processDubbingJob, {
    connection: createRedisConnection(),
    concurrency: Number(process.env.DUBBING_CONCURRENCY || 1),
  });
  worker.on('failed', async (job, err) => {
    logger.error(`[dubbing] job ${job?.id} thất bại: ${err.message}`);
    if (job) await setProgress(job.id, { status: 'failed', percent: 100, message: err.message });
  });
  worker.on('completed', (job) => logger.info(`[dubbing] job ${job.id} hoàn tất`));
  return worker;
}

module.exports = { startDubbingWorker, processDubbingJob };
