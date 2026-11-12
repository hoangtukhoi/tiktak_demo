const crypto = require('crypto');
const path = require('path');

const Video = require('../models/Video');
const storageService = require('../services/storage.service');
const { transcodeQueue, getProgress } = require('../jobs/queue');
const { success, error } = require('../utils/apiResponse');
const { MAX_VIDEO_SIZE_MB, SUPPORTED_LANGS } = require('../utils/constants');
const { resolveMentions } = require('../utils/mentions');

const mongoose = require('mongoose');
const User = require('../models/User');
const privacyService = require('../services/privacy.service');

const parseBool = (v, fallback) => (v === undefined || v === '' ? fallback : v === true || v === 'true');

/** Mảng gửi qua form-data dạng chuỗi JSON '["a","b"]' (hoặc "a,b") */
function parseList(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  const str = String(raw).trim();
  if (str.startsWith('[')) {
    try {
      const v = JSON.parse(str);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  return str.split(/[,\s]+/).filter(Boolean);
}

const VISIBILITIES = ['public', 'friends', 'private'];
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const MAX_SCHEDULE_DAYS = 30;

/**
 * Người được chọn ở ô "Gắn thẻ người khác" (mảng userId) → [{ userId, username }]
 * Bỏ chính mình, người không tồn tại / bị khoá và người không cho mình tag (quyền riêng tư).
 */
async function resolveMentionIds(raw, author) {
  const ids = [...new Set(parseList(raw).map(String))]
    .filter((id) => mongoose.Types.ObjectId.isValid(id) && id !== String(author._id))
    .slice(0, 10);
  if (!ids.length) return [];
  const users = await User.find({ _id: { $in: ids }, bannedAt: null }).select('username').lean();
  return privacyService.filterMentions(users.map((u) => ({ userId: u._id, username: u.username })), author._id);
}

function parseHashtags(raw) {
  if (!raw) return [];
  let list = raw;
  // Frontend gửi mảng dạng chuỗi JSON trong form-data: '["a","b"]'
  if (typeof raw === 'string' && raw.trim().startsWith('[')) {
    try {
      list = JSON.parse(raw);
    } catch {
      list = raw;
    }
  }
  list = Array.isArray(list) ? list : String(list).split(/[,\s]+/);
  return [...new Set(list.map((t) => String(t).replace(/^#/, '').trim().toLowerCase()).filter(Boolean))].slice(0, 20);
}

/**
 * POST /api/upload
 * Nhận file video (multipart/form-data), lưu vào MinIO,
 * tạo bản ghi Video và kích hoạt hàng đợi transcode.
 */
exports.uploadVideo = async (req, res) => {
  // .fields() → req.files.video[0]; giữ req.file cho route / test cũ dùng .single()
  if (!req.file && req.files?.video?.[0]) req.file = req.files.video[0];
  const cover = req.files?.thumbnail?.[0] || null;
  if (!req.file) {
    return error(res, 'Chưa có file video được gửi lên. Hãy đính kèm trường "video" trong form-data.', 400);
  }

  const ext = path.extname(req.file.originalname).toLowerCase() || '.mp4';
  const fileKey = `${crypto.randomUUID()}${ext}`;
  if (cover && cover.size > MAX_COVER_BYTES) return error(res, 'Ảnh bìa tối đa 5 MB', 400);

  // ── Tuỳ chọn đăng ──
  const body = req.body || {};
  const isDraft = parseBool(body.isDraft, false);
  let visibility = VISIBILITIES.includes(body.visibility) ? body.visibility : null;
  if (body.visibility && !visibility) return error(res, 'visibility phải là public, friends hoặc private', 400);
  if (!visibility) visibility = parseBool(body.isPrivate, false) ? 'private' : 'public';

  let scheduledAt = null;
  if (body.scheduledAt && !isDraft) {
    scheduledAt = new Date(body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) return error(res, 'scheduledAt không hợp lệ', 400);
    if (scheduledAt.getTime() > Date.now() + MAX_SCHEDULE_DAYS * 864e5) {
      return error(res, `Chỉ hẹn giờ đăng trong vòng ${MAX_SCHEDULE_DAYS} ngày`, 400);
    }
    if (scheduledAt <= new Date()) scheduledAt = null; // giờ đã qua → đăng ngay
  }
  const codes = SUPPORTED_LANGS.map((l) => l.code);
  const sourceLang = codes.includes(String(body.sourceLang)) ? String(body.sourceLang) : 'vi';
  // Ngôn ngữ cần lồng tiếng tự động khi video xử lý xong (bỏ mã lạ và chính ngôn ngữ gốc)
  const dubLangs = [...new Set(parseList(body.dubLangs).map(String).filter((l) => codes.includes(l) && l !== sourceLang))];

  try {
    // 1. Tạo bản ghi Video ban đầu
    const title = req.body.title?.trim() || req.file.originalname.replace(ext, '') || 'Video mới';
    const description = req.body.description?.trim() || '';
    // Người được tag (@username) — thông báo được gửi khi video xử lý xong (transcode job)
    // Gộp người được tag trong chữ (@username) với người chọn ở ô "Gắn thẻ người khác"
    const fromText = await resolveMentions(`${title} ${description}`, { excludeIds: [req.user._id], authorId: req.user._id });
    const picked = await resolveMentionIds(body.mentions, req.user);
    const seen = new Set();
    const mentions = [...fromText, ...picked].filter((m) => !seen.has(String(m.userId)) && seen.add(String(m.userId))).slice(0, 10);
    const video = await Video.create({
      userId: req.user._id,
      title,
      description,
      mentions,
      hashtags: parseHashtags(req.body.hashtags),
      visibility,
      isPrivate: visibility !== 'public',
      isDraft,
      scheduledAt,
      sourceLang,
      autoCaption: parseBool(body.autoCaption, false),
      dubLangs,
      allowComment: parseBool(body.allowComment, true),
      allowDuet: parseBool(body.allowDuet, true),
      status: 'uploading',
      sizeBytes: req.file.size,
      customThumbnail: Boolean(cover),
    });

    // Ảnh bìa tự chọn (cắt từ khung hình ở trình duyệt)
    if (cover) {
      try {
        video.thumbnailUrl = await storageService.uploadBuffer(
          `${video._id}/cover-${crypto.randomUUID()}.jpg`,
          cover.buffer,
          cover.mimetype || 'image/jpeg',
          storageService.BUCKETS.THUMBNAILS,
          storageService.IMMUTABLE_CACHE
        );
      } catch (err) {
        console.warn('[Upload] Lưu ảnh bìa lỗi, sẽ tự tạo từ video:', err.message);
        video.customThumbnail = false;
      }
    }

    const s3Key = `${video._id}/original/${fileKey}`;

    // 2. Upload file buffer lên MinIO/S3
    const originalUrl = await storageService.uploadBuffer(
      s3Key,
      req.file.buffer,
      req.file.mimetype,
      storageService.BUCKETS.VIDEOS,
      storageService.IMMUTABLE_CACHE // key chứa uuid → không bao giờ đổi nội dung
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
        visibility: video.visibility,
        isDraft: video.isDraft,
        scheduledAt: video.scheduledAt,
        thumbnailUrl: video.thumbnailUrl,
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

  // Chỉ chủ video (hoặc admin/moderator) theo dõi được tiến trình xử lý của video đó
  try {
    const job = await transcodeQueue.getJob(jobId);
    const videoId = job?.data?.videoId;
    if (videoId && !['admin', 'moderator'].includes(req.user.role)) {
      const owned = await Video.exists({ _id: videoId, userId: req.user._id });
      if (!owned) return error(res, 'Forbidden', 403);
    }
  } catch (err) {
    // Không đọc được job (Redis lỗi / job đã bị dọn) → vẫn cho xem tiến trình theo jobId
  }

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

  // Frontend đọc `progress` và `step`; giữ thêm `percent`/`message` cho tương thích
  const send = (payload) => {
    if (closed) return;
    const out = { ...payload, progress: payload.percent ?? 0, step: payload.message ?? '' };
    res.write(`data: ${JSON.stringify(out)}\n\n`);
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
