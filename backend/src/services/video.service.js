const mongoose = require('mongoose');
const Video = require('../models/Video');
const Like = require('../models/Like');
const Follow = require('../models/Follow');
const Report = require('../models/Report');

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a standard cursor-based query object.
 * cursor is the last _id seen; we return documents with _id < cursor.
 * @param {string|undefined} cursor
 * @returns {Object}
 */
const buildCursorQuery = (cursor) => (cursor ? { _id: { $lt: new mongoose.Types.ObjectId(cursor) } } : {});

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
exports.getVideoById = async (id, currentUserId) => {
  const video = await Video.findById(id)
    .populate('userId', USER_PROJECTION)
    .lean();

  if (!video) httpError('Video not found', 404);

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
    // Admins can delete any video permanently
    const video = await Video.findByIdAndDelete(id);
    if (!video) httpError('Video not found', 404);
  } else {
    // Owners soft-delete
    const video = await Video.findOneAndUpdate(
      { _id: id, userId },
      { status: 'failed' },
      { new: true }
    );
    if (!video) httpError('Video not found or you are not the owner', 404);
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

  const query = {
    userId: targetUserId,
    status: 'ready',
    ...buildCursorQuery(cursor),
  };

  // Non-owners cannot see private videos
  if (!isOwner) query.isPrivate = false;

  const videos = await Video.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1) // fetch one extra to detect if there are more pages
    .populate('userId', USER_PROJECTION)
    .lean();

  const hasMore = videos.length > limit;
  const items = hasMore ? videos.slice(0, limit) : videos;
  const nextCursor = hasMore ? String(items[items.length - 1]._id) : null;

  return { videos: items, nextCursor };
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
    ...buildCursorQuery(cursor),
  };

  const videos = await Video.find(query, { score: { $meta: 'textScore' } })
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('userId', USER_PROJECTION)
    .lean();

  const hasMore = videos.length > limit;
  const items = hasMore ? videos.slice(0, limit) : videos;
  const nextCursor = hasMore ? String(items[items.length - 1]._id) : null;

  return { videos: items, nextCursor };
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
    ...buildCursorQuery(cursor),
  };

  const videos = await Video.find(query)
    .sort({ _id: -1 })
    .limit(limit + 1)
    .populate('userId', USER_PROJECTION)
    .lean();

  const hasMore = videos.length > limit;
  const items = hasMore ? videos.slice(0, limit) : videos;
  const nextCursor = hasMore ? String(items[items.length - 1]._id) : null;

  return { videos: items, nextCursor };
};

/**
 * "For You" feed: a mix of trending videos (70 %) and videos from followed
 * accounts (30 %) for authenticated users, or pure trending for guests.
 * Results are deduplicated and returned with cursor-based pagination.
 *
 * @param {string|undefined} userId
 * @param {string|undefined} cursor
 * @param {number} limit
 * @returns {Promise<{videos: Object[], nextCursor: string|null}>}
 */
exports.getForYouFeed = async (userId, cursor, limit = 20) => {
  const trendingSlots = userId ? Math.ceil(limit * 0.7) : limit;
  const followingSlots = userId ? Math.floor(limit * 0.3) : 0;

  const baseQuery = {
    status: 'ready',
    isPrivate: false,
    moderationStatus: { $in: ['approved', 'pending'] },
    ...buildCursorQuery(cursor),
  };

  // ── Trending portion ──────────────────────────────────────────────────────
  const DECAY_LAMBDA = Math.log(2) / 72;

  const trendingDocs = await Video.aggregate([
    { $match: baseQuery },
    {
      $addFields: {
        rawScore: {
          $add: [
            '$likeCount',
            { $multiply: ['$viewCount', 0.1] },
            { $multiply: ['$commentCount', 0.5] },
          ],
        },
        ageHours: {
          $divide: [{ $subtract: [new Date(), '$createdAt'] }, 3_600_000],
        },
      },
    },
    {
      $addFields: {
        trendScore: {
          $multiply: [
            '$rawScore',
            { $exp: { $multiply: [-DECAY_LAMBDA, '$ageHours'] } },
          ],
        },
      },
    },
    { $sort: { trendScore: -1 } },
    { $limit: trendingSlots },
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
    { $project: { userDetails: 0, rawScore: 0, ageHours: 0, trendScore: 0 } },
  ]);

  let combined = [...trendingDocs];

  // ── Following portion (authenticated only) ────────────────────────────────
  if (userId && followingSlots > 0) {
    const follows = await Follow.find({ followerId: userId }).select('followingId').lean();
    const followingIds = follows.map((f) => f.followingId);

    if (followingIds.length > 0) {
      // Exclude videos already present in trending results
      const trendingIds = new Set(trendingDocs.map((v) => String(v._id)));

      const followingVideos = await Video.find({
        ...baseQuery,
        userId: { $in: followingIds },
        _id: { $nin: [...trendingIds].map((id) => new mongoose.Types.ObjectId(id)) },
      })
        .sort({ _id: -1 })
        .limit(followingSlots)
        .populate('userId', USER_PROJECTION)
        .lean();

      combined = [...combined, ...followingVideos];
    }
  }

  // Apply limit and build next cursor
  const hasMore = combined.length > limit;
  const items = hasMore ? combined.slice(0, limit) : combined;
  const nextCursor = items.length > 0 ? String(items[items.length - 1]._id) : null;

  return { videos: items, nextCursor };
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