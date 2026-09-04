const { Worker } = require('bullmq');
const redis = require('../config/redis');
const { runDubbingPipeline } = require('../services/ai/dubbingPipeline.service');
exports.startDubbingWorker = () => {
  new Worker('video-dubbing', async job => {
    await runDubbingPipeline(job.data.audioTrackId, (progress, msg) => job.updateProgress(progress));
  }, { connection: redis });
};