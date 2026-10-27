const mongoose = require('mongoose');
const Video = require('../models/Video');
const Like = require('../models/Like');
const Follow = require('../models/Follow');
const Report = require('../models/Report');
const User = require('../models/User');
const Comment = require('../models/Comment');
const AudioTrack = require('../models/AudioTrack');
const redis = require('../config/redis');

// Thời gian cache feed "For You" trong Redis (giây)
const FEED_CACHE_TTL = Number(process.env.FEED_CACHE_TTL) || 60;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a standard cursor-based query object.
 * cursor is the last _id seen; we return documents with _id < cursor.
 * @param {string|undefined} cursor
 * @returns {Object}
 */
const buildCursorQuery = (cursor) => {
  if (!cursor || isPageNumber(cursor)) return {};
  if (!mongoose.Types.ObjectId.isValid(cursor)) httpError('Invalid cursor', 400);
  return { _id: { $lt: new mongoose.Types.ObjectId(cursor) } };
};

/**
 * Frontend gửi `cursor` là số trang (undefined → 0, rồi 1, 2, ...).
 * Backend chấp nhận cả số trang lẫn ObjectId cursor (kiểu cũ).
 */
function isPageNumber(cursor) {
  return cursor !== undefined && cursor !== null && /^\d{1,6}$/.test(String(cursor));
}
const pageOf = (cursor) => (isPageNumber(cursor) ? parseInt(cursor, 10) : 0);

/**
 * Phân trang chung cho các truy vấn sắp xếp theo _id giảm dần:
 * - cursor là số trang → dùng skip
 * - cursor là ObjectId → dùng _id < cursor
 * nextCursor luôn trả về số trang kế tiếp (khớp cách frontend gọi).
 */
const findPaged = async (query, cursor, limit) => {
  const page = pageOf(cursor);
  const docs = await Video.find({ ...query, ...buildCursorQuery(cursor) })
    .sort({ _id: -1 })
    .skip(isPageNumber(cursor) ? page * limit : 0)
    .limit(limit + 1)
    .populate('userId', USER_PROJECTION)
    .lean();
  const hasMore = docs.length > limit;
  const videos = hasMore ? docs.slice(0, limit) : docs;
  return { videos, nextCursor: hasMore ? String(page + 1) : null };
};

/**
 * Throw a formatted HTTP error.
 * @param {string} message
 * @param {number} statusCode
 */
const httpError = (message, statusCode = 400) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  throw err;
};

/**
 * Common user projection used when populating video authors.
 */
const USER_PROJECTION = 'username avatarUrl isVerified';

// ─── Service Methods ──────────────────────────────────────────────────────────

/**
 * Create a new video document in status "uploading".
 * The actual upload + transcode pipeline will update it to "ready" later.
 *
 * @param {ObjectId|string} userId
 * @param {Object} data  — title, description, hashtags, isPrivate, etc.
 * @returns {Promise<Video>}
 */
exports.createVideo = async (userId, data) => {
  return Video.create({ userId, ...data, status: 'uploading' });
};

/**
 * Fetch a single video by ID, populating the author.
 * If currentUserId is provided, an isLiked boolean is appended to the result.
 *
 * @param {string} id
 * @param {string|undefined} currentUserId
 * @returns {Promise<Object>}
 */
exports.getVideoById = async (id, currentUserId, currentUserRole) => {
  const video = await Video.findById(id)
    .populate('userId', USER_PROJECTION)
    .lean();

  if (!video) httpError('Video not found', 404);

  // Chỉ chủ video hoặc admin/moderator mới xem được video private,
  // chưa xử lý xong, đã xoá hoặc đã bị gỡ. Người khác nhận 404.
  const ownerId = video.userId?._id || video.userId;
  const isOwner = currentUserId && String(ownerId) === String(currentUserId);
  const isStaff = currentUserRole === 'admin' || currentUserRole === 'moderator';
  const isPublic =
    video.status === 'ready' && !video.isPrivate && video.moderationStatus !== 'removed';
  if (!isPublic && !isOwner && !isStaff) httpError('Video not found', 404);

  // Attach isLiked flag when a viewer is authenticated
  if (currentUserId) {
    const liked = await Like.exists({
      userId: currentUserId,
      targetId: video._id,
      targetType: 'video',
    });
    video.isLiked = Boolean(liked);
  } else {
    video.isLiked = false;
  }

  return video;
};

/**
 * Update allowed fields on a video. Only the owner may do this.
 *
 * @param {string} id
 * @param {string} userId  — must match video.userId
 * @param {Object} data
 * @returns {Promise<Video>}
 */
exports.updateVideo = async (id, userId, data) => {
  // Whitelist updatable fields to prevent privilege escalation
  const allowed = ['title', 'description', 'hashtags', 'isPrivate', 'allowComment', 'allowDuet'];
  const update = {};
  for (const key of allowed) {
    if (key in data) update[key] = data[key];
  }

  const video = await Video.findOneAndUpdate({ _id: id, userId }, update, { new: true }).populate(
    'userId',
    USER_PROJECTION
  );

  if (!video) httpError('Video not found or you are not the owner', 404);
  return video;
};

/**
 * Delete a video.
 * - Regular owners get a soft-delete (status → "failed").
 * - Admins / moderators get a hard delete.
 *
 * @param {string} id
 * @param {string} userId  — the requesting user's id
 * @param {'user'|'admin'|'moderator'} role
 * @returns {Promise<void>}
 */
exports.deleteVideo = async (id, userId, role = 'user') => {
  const isAdmin = role === 'admin' || role === 'moderator';

  if (isAdmin) {
    // Admins can delete any video permanently (kèm dữ liệu liên quan)
    const video = await Video.findByIdAndDelete(id);
    if (!video) httpError('Video not found', 404);
    const comments = await Comment.find({ videoId: video._id }).select('_id').lean();
    await Promise.all([
      Like.deleteMany({ targetType: 'video', targetId: video._id }),
      Like.deleteMany({ targetType: 'comment', targetId: { $in: comments.map((c) => c._id) } }),
      Comment.deleteMany({ videoId: video._id }),
      AudioTrack.deleteMany({ videoId: video._id }),
      Report.deleteMany({ videoId: video._id }),
    ]);
    if (video.status === 'ready') {
      await User.updateOne({ _id: video.userId, videoCount: { $gt: 0 } }, { $inc: { videoCount: -1 } });
    }
  } else {
    // Owners soft-delete: đánh dấu 'deleted' (không dùng 'failed' để
    // phân biệt với video xử lý lỗi)
    const video = await Video.findOneAndUpdate(
      { _id: id, userId, status: { $ne: 'deleted' } },
      { status: 'deleted' }
    );
    if (!video) httpError('Video not found or you are not the owner', 404);
    if (video.status === 'ready') {
      await User.updateOne({ _id: userId, videoCount: { $gt: 0 } }, { $inc: { videoCount: -1 } });
    }
  }
};

/**
 * Retrieve a user's public videos with cursor-based pagination.
 * Private videos are only returned when the requester is the owner.
 *
 * @param {string} targetUserId   — whose videos to fetch
 * @param {string|undefined} cursor
 * @param {number} limit
 * @param {string|undefined} currentUserId  — the requesting user (may differ)
 * @returns {Promise<{videos: Video[], nextCursor: string|null}>}
 */
exports.getUserVideos = async (targetUserId, cursor, limit = 12, currentUserId) => {
  const isOwner = String(currentUserId) === String(targetUserId);

  const query = { userId: targetUserId, status: 'ready' };

  // Non-owners cannot see private videos
  if (!isOwner) query.isPrivate = false;

  return findPaged(query, cursor, limit);
};

/**
 * Update transcoding output URLs on a video (called by the media pipeline).
 *
 * @param {string} id
 * @param {Object} data  — hlsUrl, thumbnailUrl, durationMs, width, height, status, etc.
 * @returns {Promise<Video>}
 */
exports.updateVideoUrls = async (id, data) => {
  const allowed = ['hlsUrl', 'thumbnailUrl', 'durationMs', 'width', 'height', 'sizeBytes', 'status'];
  const update = {};
  for (const key of allowed) {
    if (key in data) update[key] = data[key];
  }
  const video = await Video.findByIdAndUpdate(id, update, { new: true });
  if (!video) httpError('Video not found', 404);
  return video;
};

/**
 * Full-text search across title, description and hashtags using the $text index.
 * Uses cursor-based pagination via _id.
 *
 * @param {string} q
 * @param {string|undefined} cursor
 * @param {number} limit
 * @returns {Promise<{videos: Video[], nextCursor: string|null}>}
 */
exports.searchVideos = async (q, cursor, limit = 12) => {
  if (!q || !q.trim()) httpError('Search query is required', 400);

  const query = {
    $text: { $search: q.trim() },
    status: 'ready',
    isPrivate: false,
    moderationStatus: { $in: ['approved', 'pending'] },
  };
  return findPaged(query, cursor, limit);
};

/**
 * Compute trending videos using a weighted engagement score with exponential
 * time-decay.
 *
 *   score = likeCount + viewCount×0.1 + commentCount×0.5
 *   decayedScore = score × exp(−λ × ageHours)   where λ = ln(2)/72 (half-life 72 h)
 *
 * Only approved+ready videos are considered.
 *
 * @param {number} limit
 * @returns {Promise<Object[]>}
 */
exports.getTrendingVideos = async (limit = 20) => {
  // λ such that score halves every 72 hours
  const DECAY_LAMBDA = Math.log(2) / 72;

  const videos = await Video.aggregate([
    {
      $match: {
        status: 'ready',
        moderationStatus: 'approved',
        isPrivate: false,
      },
    },
    {
      $addFields: {
        // Raw engagement score
        rawScore: {
          $add: [
            '$likeCount',
            { $multiply: ['$viewCount', 0.1] },
            { $multiply: ['$commentCount', 0.5] },
          ],
        },
        // Age in hours since creation
        ageHours: {
          $divide: [{ $subtract: [new Date(), '$createdAt'] }, 3_600_000],
        },
      },
    },
    {
      $addFields: {
        // Exponential decay: score × e^(−λ × ageHours)
        trendScore: {
          $multiply: [
            '$rawScore',
            { $exp: { $multiply: [-DECAY_LAMBDA, '$ageHours'] } },
          ],
        },
      },
    },
    { $sort: { trendScore: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        pipeline: [{ $project: { username: 1, avatarUrl: 1, isVerified: 1 } }],
        as: 'userDetails',
      },
    },
    { $addFields: { userId: { $arrayElemAt: ['$userDetails', 0] } } },
    { $project: { userDetails: 0, rawScore: 0, ageHours: 0 } },
  ]);

  return videos;
};

/**
 * Fetch videos from users that the given user follows.
 * Cursor-based, sorted newest first.
 *
 * @param {string} userId
 * @param {string|undefined} cursor
 * @param {number} limit
 * @returns {Promise<{videos: Video[], nextCursor: string|null}>}
 */
exports.getFollowingFeed = async (userId, cursor, limit = 20) => {
  // Collect all followingIds for this user
  const follows = await Follow.find({ followerId: userId }).select('followingId').lean();
  const followingIds = follows.map((f) => f.followingId);

  if (followingIds.length === 0) {
    return { videos: [], nextCursor: null };
  }

  const query = {
    userId: { $in: followingIds },
    status: 'ready',
    isPrivate: false,
    moderationStatus: { $in: ['approved', 'pending'] },
  };
  return findPaged(query, cursor, limit);
};

/**
 * "For You" feed: xếp hạng theo điểm tương tác có suy giảm theo thời gian.
 * Với user đã đăng nhập, video của người họ follow được nhân hệ số ưu tiên.
 *
 * Vì sắp xếp theo điểm (không theo _id) nên cursor là SỐ TRANG ("1", "2", ...),
 * khớp với cách frontend gọi (page.current). Kết quả được cache Redis 60 giây.
 *
 * @param {string|undefined} userId
 * @param {string|undefined} cursor  số trang (0-based)
 * @param {number} limit
 * @returns {Promise<{videos: Object[], nextCursor: string|null}>}
 */
exports.getForYouFeed = async (userId, cursor, limit = 20) => {
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 50);
  const page = pageOf(cursor);
  const offset = page * safeLimit;

  // Tính điểm cho toàn bộ video khá nặng → cache kết quả từng trang 60 giây.
  // Redis lỗi thì vẫn tính trực tiếp, không làm hỏng request.
  const cacheKey = `feed:foryou:${userId || 'guest'}:${page}:${safeLimit}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.warn('[feed] Redis cache read failed:', err.message);
  }
  const DECAY_LAMBDA = Math.log(2) / 72; // nửa vòng đời 72 giờ
  const FOLLOW_BOOST = 2;

  let followingIds = [];
  if (userId) {
    const follows = await Follow.find({ followerId: userId }).select('followingId').lean();
    followingIds = follows.map((f) => f.followingId);
  }

  const docs = await Video.aggregate([
    {
      $match: {
        status: 'ready',
        isPrivate: false,
        moderationStatus: { $in: ['approved', 'pending'] },
      },
    },
    {
      $addFields: {
        // +1 để video mới chưa có tương tác vẫn có điểm > 0
        rawScore: {
          $add: [
            1,
            '$likeCount',
            { $multiply: ['$viewCount', 0.1] },
            { $multiply: ['$commentCount', 0.5] },
          ],
        },
        ageHours: { $divide: [{ $subtract: [new Date(), '$createdAt'] }, 3_600_000] },
        followBoost: { $cond: [{ $in: ['$userId', followingIds] }, FOLLOW_BOOST, 1] },
      },
    },
    {
      $addFields: {
        trendScore: {
          $multiply: [
            '$rawScore',
            '$followBoost',
            { $exp: { $multiply: [-DECAY_LAMBDA, '$ageHours'] } },
          ],
        },
      },
    },
    { $sort: { trendScore: -1, _id: -1 } },
    { $skip: offset },
    { $limit: safeLimit + 1 },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        pipeline: [{ $project: { username: 1, avatarUrl: 1, isVerified: 1 } }],
        as: 'userDetails',
      },
    },
    { $addFields: { userId: { $arrayElemAt: ['$userDetails', 0] } } },
    { $project: { userDetails: 0, rawScore: 0, ageHours: 0, trendScore: 0, followBoost: 0 } },
  ]);

  const hasMore = docs.length > safeLimit;
  const videos = hasMore ? docs.slice(0, safeLimit) : docs;
  const nextCursor = hasMore ? String(page + 1) : null;
  const result = { videos, nextCursor };

  redis
    .set(cacheKey, JSON.stringify(result), 'EX', FEED_CACHE_TTL)
    .catch((err) => console.warn('[feed] Redis cache write failed:', err.message));

  return result;
};

/**
 * Aggregate the most popular hashtags from videos posted in the last 7 days.
 *
 * @param {number} limit
 * @returns {Promise<Array<{hashtag: string, count: number}>>}
 */
exports.getTrendingHashtags = async (limit = 10) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const results = await Video.aggregate([
    {
      $match: {
        status: 'ready',
        isPrivate: false,
        createdAt: { $gte: sevenDaysAgo },
      },
    },
    { $unwind: '$hashtags' },
    {
      $group: {
        _id: '$hashtags',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
    { $project: { _id: 0, hashtag: '$_id', count: 1 } },
  ]);

  return results;
};

/**
 * Increment a video's viewCount. No per-user dedup — all requests are counted.
 * Optionally accepts watchTimeMs for future engagement-metric extensions.
 *
 * @param {string} videoId
 * @param {number} watchTimeMs
 * @returns {Promise<void>}
 */
exports.recordView = async (videoId, watchTimeMs = 0) => {
  await Video.findByIdAndUpdate(videoId, { $inc: { viewCount: 1 } });
};

/**
 * Submit a report against a video.
 * - A user can only report the same video once (enforced via unique index).
 * - When reportCount reaches 3, the video's moderationStatus is set to "flagged".
 *
 * @param {string} videoId
 * @param {string} reporterId
 * @param {'spam'|'violence'|'sexual'|'other'} reason
 * @returns {Promise<Report>}
 */
exports.reportVideo = async (videoId, reporterId, reason) => {
  const video = await Video.findById(videoId);
  if (!video) httpError('Video not found', 404);

  // Create the report — unique index will throw E11000 on duplicate
  let report;
  try {
    report = await Report.create({ videoId, reporterId, reason });
  } catch (err) {
    if (err.code === 11000) httpError('You have already reported this video', 409);
    throw err;
  }

  // Atomically increment reportCount and flag if threshold reached
  const updatedVideo = await Video.findByIdAndUpdate(
    videoId,
    { $inc: { reportCount: 1 } },
    { new: true }
  );

  if (updatedVideo && updatedVideo.reportCount >= 3) {
    await Video.findByIdAndUpdate(videoId, { moderationStatus: 'flagged' });
  }

  return report;
};