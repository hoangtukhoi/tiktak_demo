const mongoose = require('mongoose');
const Video = require('../models/Video');
const Like = require('../models/Like');
const Follow = require('../models/Follow');
const Report = require('../models/Report');
const User = require('../models/User');
const Comment = require('../models/Comment');
const AudioTrack = require('../models/AudioTrack');
const ViewEvent = require('../models/ViewEvent');
const ShareEvent = require('../models/ShareEvent');
const SavedVideo = require('../models/SavedVideo');
const Repost = require('../models/Repost');
const redis = require('../config/redis');
const { resolveMentions, extractMentionUsernames, MAX_MENTIONS } = require('../utils/mentions');
const privacyService = require('./privacy.service');
const access = require('../utils/videoAccess');

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
const findPaged = async (query, cursor, rawLimit, sort = { _id: -1 }) => {
  // limit ≤ 0 sẽ thành .limit(0) = "không giới hạn" trong MongoDB → kẹp tối thiểu 1
  const limit = Math.max(1, Number(rawLimit) || 1);
  const page = pageOf(cursor);
  const docs = await Video.find({ ...query, ...buildCursorQuery(cursor) })
    .sort(sort)
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
  // Bản nháp / hẹn giờ chưa tới / bạn bè (khi không phải bạn bè) cũng 404 với người ngoài.
  const ownerId = video.userId?._id || video.userId;
  const isOwner = currentUserId && String(ownerId) === String(currentUserId);
  const isStaff = currentUserRole === 'admin' || currentUserRole === 'moderator';
  if (!(await access.canView(video, currentUserId, currentUserRole))) httpError('Video not found', 404);
  // Đã chặn nhau → coi như video không tồn tại
  if (currentUserId && !isOwner && !isStaff && (await privacyService.isBlockedBetween(currentUserId, ownerId))) {
    httpError('Video not found', 404);
  }

  // Attach isLiked / isSaved flags when a viewer is authenticated
  if (currentUserId) {
    const [liked, saved] = await Promise.all([
      Like.exists({ userId: currentUserId, targetId: video._id, targetType: 'video' }),
      SavedVideo.exists({ userId: currentUserId, videoId: video._id }),
    ]);
    video.isLiked = Boolean(liked);
    video.isSaved = Boolean(saved);
    if (video.userId?.username && !isOwner) {
      video.userId.isFollowing = Boolean(await Follow.exists({ followerId: currentUserId, followingId: ownerId }));
    }
  } else {
    video.isLiked = false;
    video.isSaved = false;
  }
  await attachRepostInfo([video], currentUserId);

  return video;
};

/**
 * Gắn isLiked / isSaved cho cả danh sách video (feed, tìm kiếm, hồ sơ) bằng 2 truy vấn.
 * Gọi SAU khi đọc cache feed để cờ luôn đúng với người đang xem.
 *
 * @param {Object[]} videos  — plain objects (lean)
 * @param {string|undefined} userId
 */
exports.attachViewerFlags = async (videos, userId) => {
  if (!Array.isArray(videos) || !videos.length) return videos;
  if (!userId) {
    videos.forEach((v) => { v.isLiked = false; v.isSaved = false; });
    await attachRepostInfo(videos, userId);
    return videos;
  }
  const ids = videos.map((v) => v._id);
  const authorIds = [...new Set(videos.map((v) => String(v.userId?._id || v.userId)))];
  const [likes, saves, follows] = await Promise.all([
    Like.find({ userId, targetType: 'video', targetId: { $in: ids } }).select('targetId').lean(),
    SavedVideo.find({ userId, videoId: { $in: ids } }).select('videoId').lean(),
    Follow.find({ followerId: userId, followingId: { $in: authorIds } }).select('followingId').lean(),
    attachRepostInfo(videos, userId),
  ]);
  const liked = new Set((likes || []).map((l) => String(l.targetId)));
  const saved = new Set((saves || []).map((s) => String(s.videoId)));
  const following = new Set((follows || []).map((f) => String(f.followingId)));
  videos.forEach((v) => {
    v.isLiked = liked.has(String(v._id));
    v.isSaved = saved.has(String(v._id));
    // Nút "+" theo dõi trên avatar tác giả ở feed
    if (v.userId && typeof v.userId === 'object' && v.userId.username) v.userId.isFollowing = following.has(String(v.userId._id));
  });
  return videos;
};

/**
 * Gắn thông tin đăng lại cho người xem:
 *  - isReposted: chính người xem đã đăng lại video này chưa
 *  - repostedBy: tối đa 3 người mà người xem đang theo dõi đã đăng lại (mới nhất trước)
 *  - repostedByCount: tổng số người đang theo dõi đã đăng lại
 */
async function attachRepostInfo(videos, userId) {
  videos.forEach((v) => { v.isReposted = false; v.repostedBy = []; v.repostedByCount = 0; v.canRepost = true; });
  if (!videos.length) return;
  // Chủ video có cho phép người khác đăng lại không (Quyền riêng tư → allowRepost)
  const ownerIds = [...new Set(videos.map((v) => String(v.userId?._id || v.userId)))];
  const owners = (await User.find({ _id: { $in: ownerIds } }).select('privacy.allowRepost').lean()) || [];
  const noRepost = new Set(owners.filter((o) => o.privacy?.allowRepost === false).map((o) => String(o._id)));
  videos.forEach((v) => { v.canRepost = !noRepost.has(String(v.userId?._id || v.userId)); });
  if (!userId) return;
  const ids = videos.map((v) => v._id);
  const follows = (await Follow.find({ followerId: userId }).select('followingId').lean()) || [];
  const people = [userId, ...follows.map((f) => f.followingId)];
  const reposts =
    (await Repost.find({ videoId: { $in: ids }, userId: { $in: people } })
      .sort({ _id: -1 })
      .populate('userId', 'username displayName avatarUrl isVerified')
      .lean()) || [];
  const byVideo = new Map(videos.map((v) => [String(v._id), v]));
  for (const r of reposts) {
    const v = byVideo.get(String(r.videoId));
    if (!v || !r.userId) continue;
    if (String(r.userId._id) === String(userId)) { v.isReposted = true; continue; }
    v.repostedByCount += 1;
    if (v.repostedBy.length < 3) v.repostedBy.push({ ...r.userId, repostedAt: r.createdAt });
  }
}
exports.attachRepostInfo = attachRepostInfo;

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
  const allowed = ['title', 'description', 'hashtags', 'isPrivate', 'visibility', 'allowComment', 'allowDuet', 'isDraft', 'scheduledAt'];
  const update = {};
  for (const key of allowed) {
    if (key in data) update[key] = data[key];
  }
  if ('visibility' in update && !['public', 'friends', 'private'].includes(update.visibility)) {
    httpError('visibility phải là public, friends hoặc private', 400);
  }
  if ('isDraft' in update) update.isDraft = update.isDraft === true || update.isDraft === 'true';
  if (update.scheduledAt) {
    const at = new Date(update.scheduledAt);
    if (Number.isNaN(at.getTime())) httpError('scheduledAt không hợp lệ', 400);
    update.scheduledAt = at > new Date() ? at : null;
    update.scheduledNotifiedAt = null;
  }
  // visibility là nguồn chính; client cũ chỉ gửi isPrivate → suy ra visibility
  if (update.visibility) update.isPrivate = update.visibility !== 'public';
  else if (typeof update.isPrivate === 'boolean') update.visibility = update.isPrivate ? 'private' : 'public';
  // Đăng bản nháp ngay → bỏ hẹn giờ cũ nếu đã qua
  if (update.scheduledAt === '' ) update.scheduledAt = null;

  let before = null;
  const wasDraft = 'isDraft' in update && update.isDraft === false
    ? Boolean(await Video.exists({ _id: id, userId, isDraft: true }))
    : false;
  if ('title' in update || 'description' in update) {
    before = await Video.findOne({ _id: id, userId }).select('title description mentions').lean();
    if (before) {
      const caption = `${update.title ?? before.title ?? ''} ${update.description ?? before.description ?? ''}`;
      const fromText = await resolveMentions(caption, { excludeIds: [userId] });
      // Người được chọn ở ô "Gắn thẻ" lúc tải lên (không có @tên trong mô tả cũ) thì giữ lại
      const oldNames = new Set(extractMentionUsernames(`${before.title ?? ''} ${before.description ?? ''}`).map((n) => n.toLowerCase()));
      const picked = (before.mentions || []).filter((m) => !oldNames.has(String(m.username).toLowerCase()));
      const seen = new Set();
      update.mentions = [...fromText, ...picked].filter((m) => !seen.has(String(m.userId)) && seen.add(String(m.userId))).slice(0, MAX_MENTIONS);
    }
  }

  const video = await Video.findOneAndUpdate({ _id: id, userId }, update, { new: true }).populate(
    'userId',
    USER_PROJECTION
  );

  if (!video) httpError('Video not found or you are not the owner', 404);

  // Chỉ báo cho người MỚI được tag (người đã được tag trước đó không nhận lại)
  // Bản nháp vừa được đăng → báo cho mọi người được tag
  if (wasDraft) {
    if (access.isLive(video) && access.visibilityOf(video) !== 'private' && !video.scheduledNotifiedAt) {
      exports.notifyVideoMentions(video).catch((err) => console.error('[updateVideo] mention notify:', err.message));
    }
    if (video.status === 'ready' && video.dubLangs?.length) {
      require('./autoDubbing.service').queueAutoDubbing(video)
        .catch((err) => console.error('[updateVideo] auto dubbing:', err.message));
    }
  } else if (before && update.mentions?.length) {
    const old = new Set((before.mentions || []).map((m) => String(m.userId)));
    const added = update.mentions.filter((m) => !old.has(String(m.userId)));
    exports.notifyVideoMentions(video, added).catch((err) => console.error('[updateVideo] mention notify:', err.message));
  }
  return video;
};

/**
 * Gửi thông báo "đã nhắc đến bạn trong một video" cho người được tag trong mô tả.
 * Chỉ gửi khi video đã công khai (ready, không riêng tư, không bị gỡ).
 */
exports.notifyVideoMentions = async (video, mentions = video.mentions) => {
  if (!mentions?.length) return;
  // Chưa đăng (nháp / hẹn giờ) hoặc chỉ mình tôi → chưa báo; tới giờ đăng thì publishDueVideos báo
  if (!access.isLive(video) || access.visibilityOf(video) === 'private') return;
  const owner = video.userId && typeof video.userId === 'object' && video.userId.username
    ? video.userId
    : await User.findById(video.userId).select('username avatarUrl').lean();
  const notificationService = require('./notification.service');
  await Promise.all(
    mentions.map((m) =>
      notificationService.createNotification(m.userId, 'mention', {
        actorId: owner?._id || video.userId,
        actorUsername: owner?.username,
        actorAvatar: owner?.avatarUrl,
        videoId: video._id,
        videoThumbnail: video.thumbnailUrl,
        context: 'video',
        message: String(video.title || '').slice(0, 100),
      })
    )
  );
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
      SavedVideo.deleteMany({ videoId: video._id }),
      Repost.deleteMany({ videoId: video._id }),
    ]);
    if (video.status === 'ready') {
      await User.updateOne({ _id: video.userId, videoCount: { $gt: 0 } }, { $inc: { videoCount: -1 } });
    }
  } else {
    // Owners soft-delete: đánh dấu 'deleted' (không dùng 'failed' để
    // phân biệt với video xử lý lỗi)
    const video = await Video.findOneAndUpdate(
      { _id: id, userId, status: { $ne: 'deleted' } },
      { status: 'deleted', pinnedAt: null }
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
exports.getUserVideos = async (targetUserId, cursor, limit = 12, currentUserId, { sort = 'latest', role } = {}) => {
  const isOwner = String(currentUserId) === String(targetUserId);
  const isStaff = role === 'admin' || role === 'moderator';

  // Chủ kênh: mọi video đã xử lý (kể cả đang xử lý, riêng tư, hẹn giờ) trừ bản nháp (có tab riêng).
  // Người khác: video công khai + video "bạn bè" nếu là bạn bè của chủ kênh.
  let query;
  if (isOwner || isStaff) {
    query = { userId: targetUserId, status: isOwner ? { $in: ['ready', 'processing'] } : 'ready', isDraft: { $ne: true } };
  } else {
    const { isPrivate, ...live } = access.publicMatch();
    const friend = currentUserId && (await access.areFriends(currentUserId, targetUserId));
    query = {
      userId: targetUserId,
      ...live,
      moderationStatus: { $ne: 'removed' },
      ...(friend ? { visibility: { $in: ['public', 'friends'] } } : { isPrivate }),
    };
  }

  // popular: nhiều lượt xem trước. latest: video được ghim lên đầu (ghim sau nằm trước),
  // rồi tới video mới nhất (pinnedAt = null nhỏ nhất nên video không ghim xếp sau).
  if (sort === 'popular') return findPaged(query, isPageNumber(cursor) ? cursor : undefined, limit, { viewCount: -1, _id: -1 });
  return findPaged(query, cursor, limit, { pinnedAt: -1, _id: -1 });
};

/**
 * Bản nháp của chính mình (mới nhất trước).
 */
exports.getDrafts = async (userId, cursor, rawLimit = 12) => {
  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 12, 1), 50);
  const r = await findPaged({ userId, isDraft: true, status: { $in: ['ready', 'processing', 'uploading'] } }, cursor, limit);
  await exports.attachViewerFlags(r.videos, userId);
  return r;
};

/**
 * Video hẹn giờ đã tới giờ đăng: gửi thông báo tag (@) một lần.
 * Gọi định kỳ từ server.js (mỗi phút).
 */
exports.publishDueVideos = async (now = new Date()) => {
  const due = await Video.find({
    scheduledAt: { $ne: null, $lte: now },
    scheduledNotifiedAt: null,
    status: 'ready',
    isDraft: { $ne: true },
    moderationStatus: { $ne: 'removed' },
  })
    .limit(100)
    .lean();
  for (const v of due) {
    // Chốt nguyên tử: nhiều tiến trình cùng chạy thì chỉ 1 tiến trình gửi
    // eslint-disable-next-line no-await-in-loop
    const claimed = await Video.updateOne({ _id: v._id, scheduledNotifiedAt: null }, { scheduledNotifiedAt: now });
    if (claimed.modifiedCount) {
      // eslint-disable-next-line no-await-in-loop
      await exports.notifyVideoMentions(v).catch((err) => console.error('[publishDueVideos]', err.message));
    }
  }
  return due.length;
};

const MAX_PINNED = 3;

/**
 * Ghim / bỏ ghim video lên đầu hồ sơ. Chỉ chủ video, tối đa 3 video.
 * @returns {Promise<{ pinned: boolean, pinnedAt: Date|null }>}
 */
exports.togglePin = async (videoId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(videoId)) httpError('Invalid video id', 400);
  const video = await Video.findOne({ _id: videoId, userId, status: 'ready' }).select('pinnedAt').lean();
  if (!video) httpError('Video not found or you are not the owner', 404);

  if (video.pinnedAt) {
    await Video.updateOne({ _id: videoId }, { pinnedAt: null });
    return { pinned: false, pinnedAt: null };
  }
  const count = await Video.countDocuments({ userId, status: 'ready', pinnedAt: { $ne: null } });
  if (count >= MAX_PINNED) httpError(`Chỉ ghim được tối đa ${MAX_PINNED} video. Bỏ ghim một video khác trước.`, 409);
  const pinnedAt = new Date();
  await Video.updateOne({ _id: videoId, pinnedAt: null }, { pinnedAt });
  return { pinned: true, pinnedAt };
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
    ...access.publicMatch(),
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
        ...access.publicMatch(),
        moderationStatus: 'approved',
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

  // Video công khai + video "bạn bè" của những người là bạn bè với mình
  const friends = await access.friendIds(userId);
  const { isPrivate, ...live } = access.publicMatch();
  const publicFilter = {
    ...live,
    moderationStatus: { $in: ['approved', 'pending'] },
    $and: [{ $or: [{ isPrivate }, { visibility: 'friends', userId: { $in: friends } }] }],
  };

  // Video được người mình theo dõi đăng lại (300 lượt gần nhất) cũng vào feed,
  // xếp theo thời điểm đăng lại. Không có ai đăng lại → giữ cách phân trang cũ.
  const reposts = await Repost.aggregate([
    { $match: { userId: { $in: followingIds } } },
    { $sort: { _id: -1 } },
    { $limit: 300 },
    { $group: { _id: '$videoId', at: { $max: '$createdAt' } } },
  ]);
  const usePaging = !cursor || isPageNumber(cursor);
  if (!reposts.length || !usePaging) {
    return findPaged({ userId: { $in: followingIds }, ...publicFilter }, cursor, limit);
  }

  const safeLimit = Math.max(1, Number(limit) || 1);
  const page = pageOf(cursor);
  const repostIds = reposts.map((r) => r._id);
  const docs = await Video.aggregate([
    {
      $match: {
        ...publicFilter,
        userId: { $ne: new mongoose.Types.ObjectId(String(userId)) }, // video của mình do người khác đăng lại thì không cần hiện lại
        $or: [{ userId: { $in: followingIds } }, { _id: { $in: repostIds } }],
      },
    },
    {
      $addFields: {
        _ri: { $indexOfArray: [repostIds, '$_id'] },
      },
    },
    {
      $addFields: {
        feedAt: {
          $max: [
            { $cond: [{ $in: ['$userId', followingIds] }, '$createdAt', null] },
            { $cond: [{ $gte: ['$_ri', 0] }, { $arrayElemAt: [reposts.map((r) => r.at), '$_ri'] }, null] },
          ],
        },
      },
    },
    { $sort: { feedAt: -1, _id: -1 } },
    { $skip: page * safeLimit },
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
    { $project: { userDetails: 0, _ri: 0, feedAt: 0 } },
  ]);
  const hasMore = docs.length > safeLimit;
  return { videos: hasMore ? docs.slice(0, safeLimit) : docs, nextCursor: hasMore ? String(page + 1) : null };
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
        ...access.publicMatch(),
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
        ...access.publicMatch(),
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
const VIEW_SOURCES = ['for_you', 'following', 'profile', 'search', 'direct', 'other'];
const MAX_WATCH_MS = 60 * 60 * 1000; // chặn giá trị vô lý (tab mở cả ngày)

/** 404 nếu người này không xem được video (dùng cho đếm lượt xem / chia sẻ) */
async function assertViewable(videoId, viewerId, role) {
  const v = await Video.findById(videoId)
    .select('userId status visibility isPrivate isDraft scheduledAt moderationStatus authorBanned')
    .lean();
  if (!v || v.status !== 'ready' || !(await access.canView(v, viewerId, role))) httpError('Video not found', 404);
}

exports.recordView = async (videoId, { watchTimeMs = 0, durationMs = 0, completed = false, source = 'other', viewerId = null, role } = {}) => {
  // Chỉ đếm lượt xem cho video người này thật sự xem được (không đếm bản nháp, video riêng tư, đã gỡ...)
  await assertViewable(videoId, viewerId, role);
  const video = await Video.findOneAndUpdate(
    { _id: videoId, status: 'ready' },
    { $inc: { viewCount: 1 } },
    { new: true, projection: { userId: 1, durationMs: 1 } }
  ).lean();
  if (!video) httpError('Video not found', 404);

  // Chủ video tự xem thì vẫn tăng viewCount nhưng không tính vào số liệu phân tích
  if (viewerId && String(viewerId) === String(video.userId)) return;

  const watch = Math.min(Math.max(Number(watchTimeMs) || 0, 0), MAX_WATCH_MS);
  const dur = Number(video.durationMs) || Math.max(Number(durationMs) || 0, 0);
  const ratio = dur > 0 ? Math.min(1, watch / dur) : 0;

  await ViewEvent.create({
    videoId: video._id,
    creatorId: video.userId,
    viewerId: viewerId || null,
    watchTimeMs: watch,
    videoDurationMs: dur,
    watchedRatio: ratio,
    completed: Boolean(completed) || ratio >= 0.9,
    source: VIEW_SOURCES.includes(source) ? source : 'other',
  });
};

/** Số báo cáo CHƯA xử lý để video tự bị gắn cờ chờ admin xem (mặc định 3) */
const REPORT_FLAG_THRESHOLD = () => Math.max(1, Number(process.env.REPORT_FLAG_THRESHOLD) || 3);

/**
 * Submit a report against a video.
 * - A user can only report the same video once (enforced via unique index).
 * - Không báo cáo được video của chính mình hoặc video mình không xem được.
 * - reportCount = số báo cáo chưa xử lý; admin duyệt/gỡ video thì đưa về 0.
 * - When reportCount reaches the threshold, the video's moderationStatus is set to "flagged".
 *
 * @param {string} videoId
 * @param {string} reporterId
 * @param {string} reason  — một trong Report.REPORT_REASONS
 * @param {string} [note]
 * @returns {Promise<Report>}
 */
exports.reportVideo = async (videoId, reporterId, reason, note = '') => {
  const video = await Video.findById(videoId);
  if (!video) httpError('Video not found', 404);
  // Báo cáo được video mình xem được (kể cả video "bạn bè")
  if (!access.isLive(video) || !(await access.canView(video, reporterId))) httpError('Video not found', 404);
  if (String(video.userId) === String(reporterId)) httpError('Bạn không thể báo cáo video của chính mình', 400);

  // Create the report — unique index will throw E11000 on duplicate
  let report;
  try {
    report = await Report.create({ videoId, reporterId, reason, note: String(note || '').trim().slice(0, 300) });
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

  if (
    updatedVideo &&
    updatedVideo.reportCount >= REPORT_FLAG_THRESHOLD() &&
    !['flagged', 'removed'].includes(updatedVideo.moderationStatus)
  ) {
    await Video.findByIdAndUpdate(videoId, {
      moderationStatus: 'flagged',
      flagReason: `Bị báo cáo ${updatedVideo.reportCount} lần`,
    });
  }

  return report;
};

// ─── Lưu video (bookmark) ───────────────────────────────────────────────────

/**
 * Bật/tắt lưu video. Chỉ lưu được video mình xem được.
 * @returns {Promise<{ saved: boolean, saveCount: number }>}
 */
exports.toggleSave = async (videoId, userId, role) => {
  if (!mongoose.Types.ObjectId.isValid(videoId)) httpError('Invalid video id', 400);
  await exports.getVideoById(videoId, userId, role);

  const removed = await SavedVideo.findOneAndDelete({ userId, videoId });
  if (removed) {
    const v = await Video.findOneAndUpdate(
      { _id: videoId, saveCount: { $gt: 0 } },
      { $inc: { saveCount: -1 } },
      { new: true, projection: { saveCount: 1 } }
    ).lean();
    return { saved: false, saveCount: v?.saveCount ?? 0 };
  }

  try {
    await SavedVideo.create({ userId, videoId });
  } catch (err) {
    // Bấm lưu 2 lần liên tiếp → coi như đã lưu
    if (err.code !== 11000) throw err;
    const v = await Video.findById(videoId).select('saveCount').lean();
    return { saved: true, saveCount: v?.saveCount ?? 0 };
  }
  const v = await Video.findByIdAndUpdate(videoId, { $inc: { saveCount: 1 } }, { new: true, projection: { saveCount: 1 } }).lean();
  return { saved: true, saveCount: v?.saveCount ?? 0 };
};

/**
 * Danh sách video đã lưu (mới lưu trước), phân trang theo số trang.
 * Video đã xoá / bị gỡ / bị chủ chuyển sang riêng tư được bỏ qua.
 */
exports.getSavedVideos = async (userId, cursor, rawLimit = 12) => {
  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 12, 1), 50);
  const page = pageOf(cursor);
  const rows = await SavedVideo.find({ userId })
    .sort({ _id: -1 })
    .skip(page * limit)
    .limit(limit + 1)
    .populate({ path: 'videoId', populate: { path: 'userId', select: USER_PROJECTION } })
    .lean();
  const hasMore = rows.length > limit;
  const friends = new Set((await access.friendIds(userId)).map(String));
  const videos = rows
    .slice(0, limit)
    .map((r) => r.videoId && { ...r.videoId, savedAt: r.createdAt })
    .filter((v) => {
      if (!v) return false;
      const isOwner = String(v.userId?._id || v.userId) === String(userId);
      return access.isPublicVideo(v) || (isOwner && v.status === 'ready' && v.moderationStatus !== 'removed')
        || (access.isLive(v) && access.visibilityOf(v) === 'friends' && friends.has(String(v.userId?._id || v.userId)));
    });
  await exports.attachViewerFlags(videos, userId);
  return { videos, nextCursor: hasMore ? String(page + 1) : null };
};

/**
 * Mỗi tài khoản chỉ được tính 1 lượt chia sẻ cho 1 video (khách: 1 lượt / IP / 24 giờ).
 * Chia sẻ lại (bấm sao chép link nhiều lần...) vẫn thành công nhưng không tăng bộ đếm.
 *
 * Khoá Redis SET NX là chốt chặn nguyên tử (bấm liên tục cùng lúc chỉ 1 request lọt);
 * ShareEvent cũ là chốt thứ 2 khi Redis bị xoá dữ liệu.
 * @returns {Promise<boolean>} true nếu đây là lượt chia sẻ đầu tiên
 */
async function claimFirstShare(videoId, userId, ip) {
  const key = userId ? `share:u:${userId}:${videoId}` : ip ? `share:ip:${ip}:${videoId}` : null;
  if (!key) return true;
  try {
    // ioredis trả null khi khoá đã tồn tại
    const r = await redis.set(key, '1', 'EX', userId ? 400 * 24 * 3600 : 24 * 3600, 'NX');
    if (r === null) return false;
  } catch (err) {
    console.warn('[share] Redis lỗi, kiểm tra bằng MongoDB:', err.message);
  }
  if (userId && (await ShareEvent.exists({ videoId, userId }))) return false;
  return true;
}

/**
 * Ghi 1 lượt chia sẻ video: tăng shareCount + lưu ShareEvent cho trang phân tích.
 * Mỗi tài khoản chỉ được tính 1 lần / video (xem claimFirstShare).
 * @param {string} method  — một trong ShareEvent.SHARE_METHODS (facebook, messenger, zalo, copy_link...)
 * @returns {Promise<{ shareCount: number, counted: boolean }>}
 */
exports.recordShare = async (videoId, { userId = null, method = 'other', ip = null, role } = {}) => {
  await assertViewable(videoId, userId, role);

  if (!(await claimFirstShare(videoId, userId, ip))) {
    const current = await Video.findById(videoId).select('shareCount').lean();
    return { shareCount: current?.shareCount ?? 0, counted: false };
  }

  const video = await Video.findOneAndUpdate(
    { _id: videoId, status: 'ready' },
    { $inc: { shareCount: 1 } },
    { new: true, projection: { userId: 1, shareCount: 1 } }
  ).lean();
  if (!video) httpError('Video not found', 404);
  if (!userId || String(userId) !== String(video.userId)) {
    await ShareEvent.create({
      videoId: video._id,
      creatorId: video.userId,
      userId: userId || null,
      method: ShareEvent.SHARE_METHODS.includes(method) ? method : 'other',
    });
  }
  return { shareCount: video.shareCount, counted: true };
};

// ─── Đăng lại (repost) & video đã thích ─────────────────────────────────────

const { isPublicVideo } = access;

/**
 * Bật/tắt đăng lại video. Chỉ đăng lại được video công khai của người khác.
 * Lần đầu đăng lại → báo cho chủ video.
 * @returns {Promise<{ reposted: boolean, repostCount: number }>}
 */
exports.toggleRepost = async (videoId, user) => {
  if (!mongoose.Types.ObjectId.isValid(videoId)) httpError('Invalid video id', 400);
  const video = await Video.findById(videoId).select('userId status isPrivate visibility isDraft scheduledAt moderationStatus thumbnailUrl title').lean();
  if (!isPublicVideo(video)) httpError('Video not found', 404);
  if (String(video.userId) === String(user._id)) httpError('Không thể đăng lại video của chính mình', 400);
  if (await privacyService.isBlockedBetween(user._id, video.userId)) httpError('Video not found', 404);

  const removed = await Repost.findOneAndDelete({ userId: user._id, videoId });
  if (!removed) {
    // Chỉ chặn ĐĂNG LẠI mới; bỏ đăng lại thì luôn được
    const owner = await User.findById(video.userId).select('privacy.allowRepost').lean();
    if (owner?.privacy?.allowRepost === false) httpError('Tác giả không cho phép đăng lại video này', 403);
  }
  if (removed) {
    const v = await Video.findOneAndUpdate(
      { _id: videoId, repostCount: { $gt: 0 } },
      { $inc: { repostCount: -1 } },
      { new: true, projection: { repostCount: 1 } }
    ).lean();
    return { reposted: false, repostCount: v?.repostCount ?? 0 };
  }

  try {
    await Repost.create({ userId: user._id, videoId });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const v = await Video.findById(videoId).select('repostCount').lean();
    return { reposted: true, repostCount: v?.repostCount ?? 0 };
  }
  const v = await Video.findByIdAndUpdate(videoId, { $inc: { repostCount: 1 } }, { new: true, projection: { repostCount: 1 } }).lean();

  // Báo chủ video (mỗi người đăng lại chỉ báo 1 lần / ngày, tránh bấm bật/tắt liên tục để spam)
  let notify = true;
  try {
    notify = (await redis.set(`repost-notif:${user._id}:${videoId}`, '1', 'EX', 24 * 3600, 'NX')) !== null;
  } catch { /* Redis lỗi → vẫn báo */ }
  if (notify) {
    await require('./notification.service')
      .createNotification(video.userId, 'repost', {
        actorId: user._id,
        actorUsername: user.username,
        actorAvatar: user.avatarUrl,
        videoId: video._id,
        videoThumbnail: video.thumbnailUrl,
      })
      .catch((err) => console.error('[repost] notification error:', err.message));
  }
  return { reposted: true, repostCount: v?.repostCount ?? 0 };
};

/** Gom danh sách video từ các bản ghi (Repost / Like / SavedVideo...) theo thứ tự, bỏ video không còn công khai */
async function pagedFromRefs(Model, filter, videoField, cursor, rawLimit, viewerId) {
  const limit = Math.min(Math.max(parseInt(rawLimit, 10) || 12, 1), 50);
  const page = pageOf(cursor);
  const rows = await Model.find(filter)
    .sort({ _id: -1 })
    .skip(page * limit)
    .limit(limit + 1)
    .select(`${videoField} createdAt`)
    .lean();
  const hasMore = rows.length > limit;
  const refs = rows.slice(0, limit);
  const vids = await Video.find({ _id: { $in: refs.map((r) => r[videoField]) } }).populate('userId', USER_PROJECTION).lean();
  const byId = new Map(vids.map((v) => [String(v._id), v]));
  const videos = refs
    .map((r) => {
      const v = byId.get(String(r[videoField]));
      if (!v) return null;
      const isOwner = viewerId && String(v.userId?._id || v.userId) === String(viewerId);
      if (!isPublicVideo(v) && !(isOwner && v.status === 'ready' && v.moderationStatus !== 'removed')) return null;
      return { ...v, addedAt: r.createdAt };
    })
    .filter(Boolean);
  await exports.attachViewerFlags(videos, viewerId);
  return { videos, nextCursor: hasMore ? String(page + 1) : null };
}

/** Tab "Đăng lại" trên hồ sơ (công khai) */
exports.getUserReposts = (targetUserId, cursor, limit, viewerId) =>
  pagedFromRefs(Repost, { userId: targetUserId }, 'videoId', cursor, limit, viewerId);

/** Tab "Đã tim": video đã thích (quyền xem kiểm tra ở controller theo cài đặt likedVisibility) */
exports.getLikedVideos = (userId, cursor, limit, viewerId = userId) =>
  pagedFromRefs(Like, { userId, targetType: 'video' }, 'targetId', cursor, limit, viewerId);

/** Bỏ video của những người đã chặn nhau với người xem (feed, tìm kiếm) */
exports.removeBlocked = async (videos, userId) => {
  if (!userId || !videos?.length) return videos;
  const blocked = await privacyService.blockedIdSet(userId);
  if (!blocked.size) return videos;
  return videos.filter((v) => !blocked.has(String(v.userId?._id || v.userId)));
};
