const crypto = require('crypto');
const path = require('path');

const Video = require('../models/Video');
const storageService = require('../services/storage.service');
const { transcodeQueue, getProgress } = require('../jobs/queue');
const { success, error } = require('../utils/apiResponse');
const { MAX_VIDEO_SIZE_MB } = require('../utils/constants');

function parseHashtags(raw) {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : String(raw).split(/[,\s]+/);
  return [...new Set(list.map((t) => t.replace(/^#/, '').trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

/**
 * POST /api/upload
 * Nhận file video (multipart/form-data), lưu vào MinIO,
 * tạo bản ghi Video và kích hoạt hàng đợi transcode.
 */
exports.uploadVideo = async (req, res) => {
  if (!req.file) {
    return error(res, 'Chưa có file video được gửi lên. Hãy đính kèm trường "video" trong form-data.', 400);
  }

  const ext = path.extname(req.file.originalname).toLowerCase() || '.mp4';
  const fileKey = `${crypto.randomUUID()}${ext}`;

  try {
    // 1. Tạo bản ghi Video ban đầu
    const video = await Video.create({
      userId: req.user._id,
      title: req.body.title?.trim() || req.file.originalname.replace(ext, '') || 'Video mới',
      description: req.body.description?.trim() || '',
      hashtags: parseHashtags(req.body.hashtags),
      isPrivate: req.body.isPrivate === 'true' || req.body.isPrivate === true,
      status: 'uploading',
      sizeBytes: req.file.size,
    });

    const s3Key = `${video._id}/original/${fileKey}`;

    // 2. Upload file buffer lên MinIO/S3
    const originalUrl = await storageService.uploadBuffer(
      s3Key,
      req.file.buffer,
      req.file.mimetype,
      storageService.BUCKETS.VIDEOS
    );

    // 3. Thêm công việc vào hàng đợi transcode
    const job = await transcodeQueue.add('transcode', {
      videoId: video._id.toString(),
      sourceKey: s3Key,
      sourceBucket: storageService.BUCKETS.VIDEOS,
    });

    // 4. Cập nhật URL gốc và trạng thái
    video.originalUrl = originalUrl;
    video.hlsUrl = originalUrl; // mặc định để xem được ngay
    video.status = 'processing';
    await video.save();

    return success(
      res,
      {
        videoId: video._id,
        jobId: job.id,
        status: 'processing',
        url: originalUrl,
        title: video.title,
      },
      201,
      'Tải video lên thành công, đang trong hàng đợi xử lý'
    );
  } catch (err) {
    console.error('[Upload] Error processing video upload:', err);
    return error(res, `Tải video lên thất bại: ${err.message}`, 500);
  }
};

/**
 * POST /api/upload/presign
 * Cấp presigned URL cho client upload file lớn trực tiếp lên S3
 */
exports.createPresignedUpload = async (req, res) => {
  const ext = (req.body.extension || 'mp4').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const key = `staging/${req.user._id}/${crypto.randomUUID()}.${ext}`;
  const uploadUrl = await storageService.getPresignedUploadUrl(key, 900);
  success(res, { uploadUrl, key, expiresInSec: 900, maxSizeMB: MAX_VIDEO_SIZE_MB });
};

/**
 * GET /api/upload/:jobId/progress
 * Server-Sent Events (SSE) stream tiến trình transcode video theo thời gian thực
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
      const progress = (await getProgress(jobId)) || {
        status: 'pending',
        percent: 0,
        message: 'Đang chờ xử lý trong hàng đợi',
      };
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
