const mongoose = require('mongoose');

const Video = require('../models/Video');
const Like = require('../models/Like');
const Follow = require('../models/Follow');
const User = require('../models/User');
const Comment = require('../models/Comment');
const AudioTrack = require('../models/AudioTrack');
const Subtitle = require('../models/Subtitle');
const storageService = require('./storage.service');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } = require('../utils/constants');
const logger = require('../utils/logger');

const AUTHOR_FIELDS = 'username avatarUrl isVerified followerCount';

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

const clampLimit = (limit) =>
  Math.min(Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);

/** Chuẩn hoá dữ liệu trả về cho client, gộp sẵn cờ isLiked và isFollowing. */
async function decorate(videos, currentUserId) {
  const list = Array.isArray(videos) ? videos : [videos];
  if (!list.length) return Array.isArray(videos) ? [] : null;

  let likedSet = new Set();
  let followingSet = new Set();

  if (currentUserId) {
    const videoIds = list.map((v) => v._id);
    const authorIds = [...new Set(list.map((v) => String(v.userId?._id || v.userId)))];
    const [likes, follows] = await Promise.all([
      Like.find({ userId: currentUserId, targetType: 'video', targetId: { $in: videoIds } })
        .select('targetId')
        .lean(),
      Follow.find({ followerId: currentUserId, followingId: { $in: authorIds } })
        .select('followingId')
        .lean(),
    ]);
    likedSet = new Set(likes.map((l) => String(l.targetId)));
    followingSet = new Set(follows.map((f) => String(f.followingId)));
  }

  const decorated = list.map((v) => {
    const obj = typeof v.toObject === 'function' ? v.toObject() : v;
    const authorId = String(obj.userId?._id || obj.userId);
    return {
      ...obj,
      author: obj.userId?.username ? obj.userId : undefined,
      isLiked: likedSet.has(String(obj._id)),
      isFollowingAuthor: followingSet.has(authorId),
    };
  });

  return Array.isArray(videos) ? decorated : decorated[0];
}

async function createVideo(userId, data) {
  const video = await Video.create({ ...data, userId, status: data.originalKey ? 'processing' : 'uploading' });
  await User.findByIdAndUpdate(userId, { $inc: { videoCount: 1 } });
  return video;
}

async function getVideoById(id, currentUserId) {
  const video = await Video.findOne({ _id: id, isDeleted: false }).populate('userId', AUTHOR_FIELDS);
  if (!video) throw httpError('Không tìm thấy video', 404);
  if (video.isPrivate && String(video.userId._id) !== String(currentUserId)) {
    throw httpError('Video này ở chế độ riêng tư', 403);
  }
  return decorate(video, currentUserId);
}

async function updateVideo(id, userId, data) {
  const video = await Video.findOneAndUpdate({ _id: id, userId, isDeleted: false }, data, { new: true });
  if (!video) throw httpError('Không tìm thấy video hoặc bạn không có quyền sửa', 404);
  return video;
}

/** Xoá mềm bản ghi và dọn file trên S3 để không tốn dung lượng. */
async function deleteVideo(id, userId) {
  const video = await Video.findOne({ _id: id, isDeleted: false });
  if (!video) throw httpError('Không tìm thấy video', 404);
  if (String(video.userId) !== String(userId)) throw httpError('Bạn không có quyền xoá video này', 403);

  video.isDeleted = true;
  video.status = 'failed';
  await video.save();

  await Promise.all([
    User.findByIdAndUpdate(userId, { $inc: { videoCount: -1 } }),
    Comment.updateMany({ videoId: id }, { isDeleted: true }),
    Like.deleteMany({ targetId: id, targetType: 'video' }),
    AudioTrack.deleteMany({ videoId: id }),
    Subtitle.deleteMany({ videoId: id }),
  ]);

  storageService
    .deletePrefix(`${id}/`, storageService.BUCKETS.VIDEOS)
    .catch((err) => logger.warn(`Không xoá được file của video ${id}: ${err.message}`));

  return true;
}

async function updateVideoUrls(id, data) {
  return Video.findByIdAndUpdate(id, data, { new: true });
}

/** Like hoặc bỏ like. Trả về trạng thái mới và số like sau thao tác. */
async function toggleLike(videoId, userId) {
  const video = await Video.findOne({ _id: videoId, isDeleted: false }).select('userId likeCount thumbnailUrl');
  if (!video) throw httpError('Không tìm thấy video', 404);

  const existing = await Like.findOne({ userId, targetId: videoId, targetType: 'video' });

  if (existing) {
    await existing.deleteOne();
    const updated = await Video.findByIdAndUpdate(videoId, { $inc: { likeCount: -1 } }, { new: true });
    return { isLiked: false, likeCount: Math.max(0, updated.likeCount) };
  }

  await Like.create({ userId, targetId: videoId, targetType: 'video' });
  const updated = await Video.findByIdAndUpdate(videoId, { $inc: { likeCount: 1 } }, { new: true });

  await notificationService.createNotification(video.userId, NOTIFICATION_TYPES.NEW_LIKE, {
    actorId: userId,
    videoId,
    videoThumbnail: video.thumbnailUrl,
    message: 'đã thích video của bạn',
  });

  return { isLiked: true, likeCount: updated.likeCount };
}

/**
 * Ghi nhận lượt xem. Chỉ tính khi xem đủ ngưỡng để tránh spam view
 * khi người dùng lướt nhanh qua feed.
 */
async function recordView(videoId, watchTimeMs = 0) {
  const MIN_WATCH_MS = 3000;
  if (watchTimeMs && watchTimeMs < MIN_WATCH_MS) return { counted: false };
  await Video.findByIdAndUpdate(videoId, {
    $inc: { viewCount: 1, totalWatchTimeMs: Math.max(0, Number(watchTimeMs) || 0) },
  });
  return { counted: true };
}

async function getUserVideos(userId, { cursor, limit = DEFAULT_PAGE_SIZE, includePrivate = false } = {}) {
  const query = Video.publicFilter({ userId });
  if (includePrivate) delete query.isPrivate;
  if (cursor && mongoose.isValidObjectId(cursor)) query._id = { $lt: cursor };

  const size = clampLimit(limit);
  const videos = await Video.find(query)
    .sort({ _id: -1 })
    .limit(size + 1)
    .populate('userId', AUTHOR_FIELDS);

  return buildCursorPage(videos, size);
}

async function searchVideos(q, { page = 1, limit = DEFAULT_PAGE_SIZE } = {}) {
  const size = clampLimit(limit);
  const skip = (Math.max(1, page) - 1) * size;
  if (!q || !q.trim()) return { videos: [], pagination: { page: 1, limit: size, total: 0, hasMore: false } };

  const term = q.trim();
  const filter = Video.publicFilter({
    $or: [
      { title: new RegExp(escapeRegex(term), 'i') },
      { hashtags: term.replace(/^#/, '').toLowerCase() },
    ],
  });

  const [videos, total] = await Promise.all([
    Video.find(filter).sort({ likeCount: -1, createdAt: -1 }).skip(skip).limit(size).populate('userId', AUTHOR_FIELDS),
    Video.countDocuments(filter),
  ]);

  return {
    videos,
    pagination: { page: Number(page), limit: size, total, hasMore: skip + videos.length < total },
  };
}

/**
 * Feed "Dành cho bạn".
 * Điểm xếp hạng = tương tác có trọng số, giảm dần theo độ cũ của video.
 * Loại bỏ video người dùng đã like để feed không lặp lại.
 */
async function getForYouFeed(currentUserId, { cursorScore, limit = DEFAULT_PAGE_SIZE } = {}) {
  const size = clampLimit(limit);

  let excludeIds = [];
  if (currentUserId) {
    const liked = await Like.find({ userId: currentUserId, targetType: 'video' })
      .select('targetId')
      .limit(500)
      .lean();
    excludeIds = liked.map((l) => l.targetId);
  }

  const match = Video.publicFilter();
  if (excludeIds.length) match._id = { $nin: excludeIds };

  const pipeline = [
    { $match: match },
    {
      $addFields: {
        ageHours: { $divide: [{ $subtract: ['$$NOW', '$createdAt'] }, 1000 * 60 * 60] },
      },
    },
    {
      $addFields: {
        score: {
          $divide: [
            {
              $add: [
                { $multiply: ['$likeCount', 3] },
                { $multiply: ['$commentCount', 4] },
                { $multiply: ['$shareCount', 5] },
                { $multiply: ['$viewCount', 0.2] },
                1,
              ],
            },
            { $pow: [{ $add: ['$ageHours', 2] }, 1.3] },
          ],
        },
      },
    },
  ];

  if (cursorScore) pipeline.push({ $match: { score: { $lt: Number(cursorScore) } } });

  pipeline.push(
    { $sort: { score: -1, _id: -1 } },
    { $limit: size + 1 },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'author',
        pipeline: [{ $project: { username: 1, avatarUrl: 1, isVerified: 1, followerCount: 1 } }],
      },
    },
    { $unwind: { path: '$author', preserveNullAndEmptyArrays: true } }
  );

  const rows = await Video.aggregate(pipeline);
  const hasMore = rows.length > size;
  const page = hasMore ? rows.slice(0, size) : rows;

  return {
    videos: await decorate(page, currentUserId),
    nextCursor: hasMore ? String(page[page.length - 1].score) : null,
    hasMore,
  };
}

/** Feed "Đang theo dõi": video mới nhất của những người mình follow. */
async function getFollowingFeed(currentUserId, { cursor, limit = DEFAULT_PAGE_SIZE } = {}) {
  const follows = await Follow.find({ followerId: currentUserId }).select('followingId').lean();
  const authorIds = follows.map((f) => f.followingId);
  if (!authorIds.length) return { videos: [], nextCursor: null, hasMore: false };

  const query = Video.publicFilter({ userId: { $in: authorIds } });
  if (cursor && mongoose.isValidObjectId(cursor)) query._id = { $lt: cursor };

  const size = clampLimit(limit);
  const videos = await Video.find(query)
    .sort({ _id: -1 })
    .limit(size + 1)
    .populate('userId', AUTHOR_FIELDS);

  const page = await buildCursorPage(videos, size);
  page.videos = await decorate(page.videos, currentUserId);
  return page;
}

/** Hashtag đang thịnh hành trong n ngày gần đây. */
async function getTrendingHashtags(days = 7, limit = 20) {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  return Video.aggregate([
    { $match: Video.publicFilter({ createdAt: { $gte: since } }) },
    { $unwind: '$hashtags' },
    {
      $group: {
        _id: '$hashtags',
        videoCount: { $sum: 1 },
        viewCount: { $sum: '$viewCount' },
      },
    },
    { $sort: { viewCount: -1, videoCount: -1 } },
    { $limit: limit },
    { $project: { _id: 0, hashtag: '$_id', videoCount: 1, viewCount: 1 } },
  ]);
}

async function getVideosByHashtag(hashtag, { cursor, limit = DEFAULT_PAGE_SIZE } = {}) {
  const query = Video.publicFilter({ hashtags: hashtag.replace(/^#/, '').toLowerCase() });
  if (cursor && mongoose.isValidObjectId(cursor)) query._id = { $lt: cursor };
  const size = clampLimit(limit);
  const videos = await Video.find(query)
    .sort({ _id: -1 })
    .limit(size + 1)
    .populate('userId', AUTHOR_FIELDS);
  return buildCursorPage(videos, size);
}

function buildCursorPage(rows, size) {
  const hasMore = rows.length > size;
  const videos = hasMore ? rows.slice(0, size) : rows;
  return {
    videos,
    nextCursor: hasMore ? String(videos[videos.length - 1]._id) : null,
    hasMore,
  };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  createVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  updateVideoUrls,
  toggleLike,
  recordView,
  getUserVideos,
  searchVideos,
  getForYouFeed,
  getFollowingFeed,
  getTrendingHashtags,
  getVideosByHashtag,
  decorate,
  AUTHOR_FIELDS,
};
