const { Worker } = require('bullmq');
const redis = require('../config/redis');
const { runDubbingPipeline } = require('../services/ai/dubbingPipeline.service');

let workerInstance = null;

exports.startDubbingWorker = () => {
  if (workerInstance) return workerInstance;
  workerInstance = new Worker(
    'video-dubbing',
    async (job) => {
      await runDubbingPipeline(job.data.audioTrackId, (progress) => job.updateProgress(progress));
    },
    {
      connection: redis,
      // Chạy model trên CPU tốn RAM/CPU → mỗi lúc 1 job, cho phép chạy lâu
      concurrency: 1,
      lockDuration: 15 * 60 * 1000,
    }
  );
  workerInstance.on('failed', (job, err) => console.error(`[Worker] Dubbing job ${job?.id} thất bại:`, err.message));
  workerInstance.on('completed', (job) => console.log(`[Worker] Dubbing job ${job.id} hoàn tất`));
  return workerInstance;
};
