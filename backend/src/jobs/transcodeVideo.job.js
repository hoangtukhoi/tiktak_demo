const path = require('path');
const { Worker } = require('bullmq');

const { createRedisConnection } = require('../config/redis');
const { QUEUES, NOTIFICATION_TYPES, SOCKET_EVENTS } = require('../utils/constants');
const transcodeService = require('../services/transcode.service');
const storageService = require('../services/storage.service');
const notificationService = require('../services/notification.service');
const { emitToUser } = require('../sockets/notification.socket');
const { setProgress } = require('./queue');
const Video = require('../models/Video');
const logger = require('../utils/logger');

/**
 * Job transcode: tải file gốc -> ffmpeg ra HLS nhiều mức -> upload S3
 * -> cập nhật Video -> báo cho người đăng.
 */
async function processTranscodeJob(job) {
  const { videoId, sourceKey, sourceBucket } = job.data;
  const video = await Video.findById(videoId);
  if (!video) throw new Error(`Không tìm thấy video ${videoId}`);

  const workDir = await transcodeService.createWorkDir('transcode-');
  const report = async (percent, message) => {
    await job.updateProgress(percent);
    await setProgress(job.id, { status: 'processing', percent, message, videoId });
    emitToUser(video.userId, SOCKET_EVENTS.TRANSCODE_PROGRESS, { videoId, percent, message });
  };

  try {
    await Video.findByIdAndUpdate(videoId, { status: 'processing' });
    await report(5, 'Đang tải file gốc');

    const inputPath = path.join(workDir, 'source' + (path.extname(sourceKey) || '.mp4'));
    await storageService.downloadToFile(
      sourceBucket || storageService.BUCKETS.VIDEOS,
      sourceKey,
      inputPath
    );

    await report(10, 'Đang đọc thông tin video');
    const metadata = await transcodeService.getMetadata(inputPath);

    await report(15, 'Đang tạo thumbnail');
    const thumbPath = path.join(workDir, 'thumbnail.jpg');
    await transcodeService.extractThumbnail(inputPath, thumbPath, Math.min(1, metadata.durationMs / 2000));
    const thumbnailUrl = await storageService.uploadFile(
      `${videoId}/thumbnail.jpg`,
      thumbPath,
      storageService.BUCKETS.THUMBNAILS
    );

    const hlsDir = path.join(workDir, 'hls');
    const result = await transcodeService.transcodeToHLS(inputPath, hlsDir, (percent) => {
      // Giai đoạn transcode chiếm khoảng 20% -> 85% tổng tiến trình.
      report(20 + Math.round(percent * 0.65), `Đang chuyển mã ${percent}%`).catch(() => {});
    });

    await report(88, 'Đang tải kết quả lên storage');
    const uploaded = await storageService.uploadDirectory(
      hlsDir,
      `${videoId}/hls`,
      storageService.BUCKETS.VIDEOS
    );

    await Video.findByIdAndUpdate(videoId, {
      status: 'ready',
      hlsUrl: uploaded['master.m3u8'],
      thumbnailUrl,
      durationMs: metadata.durationMs,
      width: metadata.width,
      height: metadata.height,
      sizeBytes: metadata.sizeBytes,
      availableQualities: result.variants,
      hasAudio: metadata.hasAudio,
      moderationStatus: 'pending',
    });

    await report(100, 'Hoàn tất');
    await setProgress(job.id, {
      status: 'completed',
      percent: 100,
      message: 'Hoàn tất',
      videoId,
      hlsUrl: uploaded['master.m3u8'],
      thumbnailUrl,
    });

    await notificationService.createNotification(video.userId, NOTIFICATION_TYPES.VIDEO_READY, {
      videoId: video._id,
      videoThumbnail: thumbnailUrl,
      message: 'Video của bạn đã xử lý xong và sẵn sàng hiển thị',
    });

    return { videoId, hlsUrl: uploaded['master.m3u8'] };
  } catch (err) {
    logger.error(`Transcode thất bại cho video ${videoId}: ${err.message}`);
    await Video.findByIdAndUpdate(videoId, { status: 'failed', processingError: err.message });
    await setProgress(job.id, { status: 'failed', percent: 100, message: err.message, videoId });
    emitToUser(video.userId, SOCKET_EVENTS.TRANSCODE_PROGRESS, {
      videoId,
      percent: 100,
      status: 'failed',
      message: err.message,
    });
    throw err;
  } finally {
    await transcodeService.cleanupDir(workDir);
  }
}

function startTranscodeWorker() {
  const worker = new Worker(QUEUES.TRANSCODE, processTranscodeJob, {
    connection: createRedisConnection(),
    concurrency: Number(process.env.TRANSCODE_CONCURRENCY || 1),
  });
  worker.on('failed', (job, err) =>
    logger.error(`[transcode] job ${job?.id} thất bại: ${err.message}`)
  );
  worker.on('completed', (job) => logger.info(`[transcode] job ${job.id} hoàn tất`));
  return worker;
}

module.exports = { startTranscodeWorker, processTranscodeJob };
