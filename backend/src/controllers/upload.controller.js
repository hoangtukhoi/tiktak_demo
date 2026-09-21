const { randomUUID } = require('crypto');
const path = require('path');

const Video = require('../models/Video');
const storageService = require('../services/storage.service');
const { transcodeQueue, getProgress } = require('../jobs/queue');
const { success, error } = require('../utils/apiResponse');
const { MAX_VIDEO_SIZE_MB } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * B1 của luồng upload: nhận file, đẩy thẳng lên S3, tạo bản ghi Video
 * ở trạng thái "processing" rồi enqueue job transcode.
 * Client nhận videoId + jobId để theo dõi tiến trình qua SSE.
 */
exports.uploadVideo = async (req, res) => {
  if (!req.file) return error(res, 'Chưa có file video được gửi lên', 400);

  const ext = path.extname(req.file.originalname).toLowerCase() || '.mp4';
  const video = await Video.create({
    userId: req.user._id,
    title: req.body.title?.trim() || req.file.originalname.replace(ext, ''),
    description: req.body.description?.trim() || '',
    hashtags: parseHashtags(req.body.hashtags),
    originalLang: req.body.originalLang || null,
    isPrivate: req.body.isPrivate === 'true' || req.body.isPrivate === true,
    status: 'uploading',
    sizeBytes: req.file.size,
  });

  const key = `${video._id}/original/${randomUUID()}${ext}`;
  try {
    const originalUrl = await storageService.uploadBuffer(
      key,
      req.file.buffer,
      req.file.mimetype,
      storageService.BUCKETS.VIDEOS
    );

    const job = await transcodeQueue.add('transcode', {
      videoId: video._id.toString(),
      sourceKey: key,
      sourceBucket: storageService.BUCKETS.VIDEOS,
    });

    video.originalKey = key;
    video.originalUrl = originalUrl;
    video.status = 'processing';
    video.transcodeJobId = job.id;
    await video.save();

    return success(
      res,
      { videoId: video._id, jobId: job.id, status: 'processing', url: originalUrl },
      202,
      'Đã nhận video, đang xử lý'
    );
  } catch (err) {
    logger.error(`Upload thất bại cho video ${video._id}: ${err.message}`);
    await Video.findByIdAndUpdate(video._id, { status: 'failed', processingError: err.message });
    return error(res, 'Tải video lên thất bại', 500);
  }
};

/** Lấy URL ký sẵn để client tự upload thẳng lên S3 với file lớn. */
exports.createPresignedUpload = async (req, res) => {
  const ext = (req.body.extension || 'mp4').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const key = `staging/${req.user._id}/${randomUUID()}.${ext}`;
  const uploadUrl = await storageService.getPresignedUploadUrl(key, 900);
  success(res, { uploadUrl, key, expiresInSec: 900, maxSizeMB: MAX_VIDEO_SIZE_MB });
};

/**
 * Server-Sent Events: đẩy tiến trình transcode về client.
 * Đọc tiến trình từ Redis nên hoạt động cả khi worker chạy tiến trình riêng.
 */
exports.streamProgress = async (req, res) => {
  const { jobId } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;
  req.on('close', () => {
    closed = true;
    clearInterval(timer);
  });

  const send = (payload) => {
    if (!closed) res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const tick = async () => {
    try {
      const progress = (await getProgress(jobId)) || { status: 'pending', percent: 0, message: 'Đang chờ xử lý' };
      send(progress);
      if (progress.status === 'completed' || progress.status === 'failed') {
        clearInterval(timer);
        if (!closed) res.end();
      }
    } catch (err) {
      send({ status: 'failed', percent: 100, message: err.message });
      clearInterval(timer);
      if (!closed) res.end();
    }
  };

  const timer = setInterval(tick, 1000);
  tick();
};

function parseHashtags(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/);
  return [...new Set(list.map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}
