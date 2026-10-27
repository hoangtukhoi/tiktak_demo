const mongoose = require('mongoose');
const videoService = require('../services/video.service');
const Like = require('../models/Like');
const Video = require('../models/Video');
const { success, error, paginated } = require('../utils/apiResponse');
const notificationService = require('../services/notification.service');

// ─── Video CRUD ───────────────────────────────────────────────────────────────

/**
 * POST /api/videos
 * Video creation is handled by the upload route (multipart/form-data + S3).
 * This stub returns 501 so accidental direct calls fail clearly.
 */
exports.createVideo = async (req, res) => {
  return res.status(400).json({ success: false, message: 'Vui lòng sử dụng endpoint POST /api/upload với định dạng multipart/form-data để tải video lên.' });
};

/**
 * GET /api/videos/:id
 * Fetch a single video. Authenticated users get an isLiked flag.
 */
exports.getVideo = async (req, res) => {
  const video = await videoService.getVideoById(req.params.id, req.user?._id, req.user?.role);
  success(res, video);
};

/**
 * PATCH /api/videos/:id
 * Update video metadata. Only the owner may call this.
 */
exports.updateVideo = async (req, res) => {
  const video = await videoService.updateVideo(req.params.id, req.user._id, req.body);
  success(res, video);
};

/**
 * DELETE /api/videos/:id
 * Soft-delete (owner) or hard-delete (admin/moderator).
 */
exports.deleteVideo = async (req, res) => {
  await videoService.deleteVideo(req.params.id, req.user._id, req.user.role);
  success(res, null, 200, 'Video deleted successfully');
};

// ─── Engagement ───────────────────────────────────────────────────────────────

/**
 * POST /api/videos/:id/like
 * Toggle like on a video.
 *   • Already liked → remove Like doc, decrement likeCount
 *   • Not liked    → create Like doc, increment likeCount, send notification
 */
exports.likeVideo = async (req, res) => {
  const videoId = req.params.id;
  const userId = req.user._id;

  // Kiểm tra video tồn tại và được phép xem TRƯỚC khi tạo Like
  // (tránh Like mồ côi khi videoId sai)
  await videoService.getVideoById(videoId, userId, req.user.role);

  // Check if the user has already liked this video
  const existingLike = await Like.findOne({
    userId,
    targetId: videoId,
    targetType: 'video',
  });

  if (existingLike) {
    // ── Unlike ────────────────────────────────────────────────────────────────
    await existingLike.deleteOne();
    await Video.updateOne({ _id: videoId, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
    return success(res, { liked: false }, 200, 'Like removed');
  }

  // ── Like ──────────────────────────────────────────────────────────────────
  try {
    await Like.create({ userId, targetId: videoId, targetType: 'video' });
  } catch (err) {
    // Bấm like 2 lần liên tiếp (race condition) → coi như đã like
    if (err.code === 11000) return success(res, { liked: true }, 200, 'Already liked');
    throw err;
  }
  const video = await Video.findByIdAndUpdate(
    videoId,
    { $inc: { likeCount: 1 } },
    { new: true }
  ).populate('userId', 'username avatarUrl isVerified');

  if (!video) return error(res, 'Video not found', 404);

  // Send notification to the video owner (skip if liker is the owner)
  if (String(video.userId._id) !== String(userId)) {
    notificationService
      .createNotification(video.userId._id, 'new_like', {
        actorId: userId,
        actorUsername: req.user.username,
        actorAvatar: req.user.avatarUrl,
        videoId: video._id,
        videoThumbnail: video.thumbnailUrl,
      })
      .catch((err) => console.error('[likeVideo] notification error:', err));
  }

  return success(res, { liked: true, likeCount: video.likeCount }, 200, 'Like added');
};

/**
 * POST /api/videos/:id/view
 * Record a view event. Body may contain { watchTimeMs }.
 */
exports.recordView = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return error(res, 'Invalid video id', 400);
  const watchTimeMs = Number(req.body?.watchTimeMs) || 0;
  await videoService.recordView(req.params.id, watchTimeMs);
  success(res, null, 200, 'View recorded');
};

// ─── Internal (pipeline callback) ────────────────────────────────────────────

/**
 * PATCH /api/videos/:id/urls
 * Called by the transcoding pipeline to update HLS/thumbnail URLs after processing.
 * Not authenticated via user token; protected at the network/API-key layer instead.
 */
exports.updateVideoUrls = async (req, res) => {
  const video = await videoService.updateVideoUrls(req.params.id, req.body);
  success(res, video);
};

// ─── Discovery ────────────────────────────────────────────────────────────────

/**
 * GET /api/videos/search?q=&cursor=&limit=
 * Full-text search with cursor-based pagination.
 */
exports.searchVideos = async (req, res) => {
  const { q, cursor, limit } = req.query;
  const result = await videoService.searchVideos(q, cursor, Math.min(Number(limit) || 12, 50));
  paginated(res, result.videos, { nextCursor: result.nextCursor });
};

/**
 * GET /api/videos/hashtags/trending?limit=
 * Return the most-used hashtags in the last 7 days.
 */
exports.getTrendingHashtags = async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);
  const hashtags = await videoService.getTrendingHashtags(limit);
  success(res, hashtags);
};

// ─── Moderation ───────────────────────────────────────────────────────────────

/**
 * POST /api/videos/:id/report
 * Submit a report for a video. Body: { reason }
 * A user may only report the same video once.
 */
exports.reportVideo = async (req, res) => {
  const { reason } = req.body;

  if (!reason) return error(res, 'reason is required', 400);

  const report = await videoService.reportVideo(req.params.id, req.user._id, reason);
  success(res, report, 201, 'Report submitted');
};