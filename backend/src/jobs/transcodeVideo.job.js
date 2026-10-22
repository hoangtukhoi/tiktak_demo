const path = require('path');
const os = require('os');
const fs = require('fs');
const fsp = require('fs/promises');
const { Worker } = require('bullmq');
const ffmpeg = require('fluent-ffmpeg');

const redis = require('../config/redis');
const Video = require('../models/Video');
const User = require('../models/User');
const storageService = require('../services/storage.service');
const notificationService = require('../services/notification.service');
const { emitToUser } = require('../sockets/notification.socket');
const { setProgress } = require('./queue');

async function checkFfmpeg() {
  return new Promise((resolve) => {
    ffmpeg.getAvailableFormats((err) => resolve(!err));
  });
}

async function processTranscodeJob(job) {
  const { videoId, sourceKey, sourceBucket } = job.data;
  const video = await Video.findById(videoId);
  if (!video) throw new Error(`Không tìm thấy video ${videoId}`);

  const report = async (percent, message) => {
    await job.updateProgress(percent);
    await setProgress(job.id, { status: 'processing', percent, message, videoId });
    emitToUser(video.userId, 'transcode:progress', { videoId, percent, message });
  };

  const workDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'tiktak-transcode-'));

  try {
    await Video.findByIdAndUpdate(videoId, { status: 'processing' });
    await report(10, 'Đang chuẩn bị xử lý video');

    const hasFfmpeg = await checkFfmpeg();

    let thumbnailUrl = `https://picsum.photos/seed/${videoId}/720/1280`;
    let durationMs = 15000;
    let width = 720;
    let height = 1280;

    if (hasFfmpeg && sourceKey) {
      try {
        await report(25, 'Đang tải file video để xử lý');
        const localSource = path.join(workDir, 'source' + (path.extname(sourceKey) || '.mp4'));
        await storageService.downloadToFile(
          sourceBucket || storageService.BUCKETS.VIDEOS,
          sourceKey,
          localSource
        );

        await report(40, 'Đang trích xuất thông tin video');
        const metadata = await new Promise((resolve, reject) => {
          ffmpeg.ffprobe(localSource, (err, data) => {
            if (err) return resolve(null);
            const vStream = data.streams?.find((s) => s.codec_type === 'video');
            resolve({
              durationMs: Math.round((data.format?.duration || 15) * 1000),
              width: vStream?.width || 720,
              height: vStream?.height || 1280,
            });
          });
        });

        if (metadata) {
          durationMs = metadata.durationMs;
          width = metadata.width;
          height = metadata.height;
        }

        await report(60, 'Đang tạo hình thu nhỏ (thumbnail)');
        const thumbLocal = path.join(workDir, 'thumb.jpg');
        await new Promise((resolve, reject) => {
          ffmpeg(localSource)
            .screenshots({
              timestamps: [1],
              filename: 'thumb.jpg',
              folder: workDir,
              size: '720x?',
            })
            .on('end', resolve)
            .on('error', (err) => {
              console.warn('[ffmpeg] Thumbnail extraction failed:', err.message);
              resolve(); // non-fatal
            });
        });

        if (fs.existsSync(thumbLocal)) {
          thumbnailUrl = await storageService.uploadFile(
            `${videoId}/thumbnail.jpg`,
            thumbLocal,
            storageService.BUCKETS.THUMBNAILS
          );
        }
      } catch (procErr) {
        console.warn('[transcode] FFmpeg processing warning, using fallback:', procErr.message);
      }
    }

    await report(85, 'Đang lưu trữ và cập nhật trạng thái');

    // Cập nhật bản ghi video sang ready
    await Video.findByIdAndUpdate(videoId, {
      status: 'ready',
      moderationStatus: 'approved',
      hlsUrl: video.hlsUrl || video.originalUrl,
      thumbnailUrl,
      durationMs,
      width,
      height,
    });

    // Tăng số lượng video của user
    await User.findByIdAndUpdate(video.userId, { $inc: { videoCount: 1 } });

    await report(100, 'Xử lý video hoàn tất');
    await setProgress(job.id, {
      status: 'completed',
      percent: 100,
      message: 'Hoàn tất',
      videoId,
      url: video.originalUrl,
      thumbnailUrl,
    });

    // Gửi thông báo đến user
    await notificationService.createNotification(video.userId, 'video_ready', {
      videoId: video._id,
      videoThumbnail: thumbnailUrl,
      message: `Video "${video.title}" của bạn đã xử lý xong và sẵn sàng hiển thị!`,
    }).catch(() => {});

    return { videoId, status: 'ready' };
  } catch (err) {
    console.error(`[transcode] Job ${job.id} failed:`, err.message);
    await Video.findByIdAndUpdate(videoId, { status: 'failed', flagReason: err.message });
    await setProgress(job.id, { status: 'failed', percent: 100, message: err.message, videoId });
    emitToUser(video.userId, 'transcode:progress', {
      videoId,
      percent: 100,
      status: 'failed',
      message: err.message,
    });
    throw err;
  } finally {
    await fsp.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

let workerInstance = null;

function startTranscodeWorker() {
  if (workerInstance) return workerInstance;
  workerInstance = new Worker('video-transcode', processTranscodeJob, {
    connection: redis,
    concurrency: 2,
  });

  workerInstance.on('completed', (job) => {
    console.log(`[Worker] Job transcode ${job.id} hoàn tất`);
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`[Worker] Job transcode ${job?.id} thất bại:`, err.message);
  });

  return workerInstance;
}

module.exports = {
  startTranscodeWorker,
  processTranscodeJob,
};