const { Worker } = require('bullmq');
const redis = require('../config/redis');
const videoService = require('../services/video.service');
exports.startTranscodeWorker = () => {
  new Worker('video-transcode', async job => {
    // Process transcode
    await videoService.updateVideoUrls(job.data.videoId, { status: 'ready' });
  }, { connection: redis });
};