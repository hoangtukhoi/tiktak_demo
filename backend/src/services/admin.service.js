const User = require('../models/User');
const Video = require('../models/Video');
const Comment = require('../models/Comment');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const storageService = require('./storage.service');
const logger = require('../utils/logger');

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

async function writeAudit(actor, action, targetType, targetId, reason, metadata = {}) {
  return AuditLog.create({
    actorId: actor._id,
    actorUsername: actor.username,
    action,
    targetType,
    targetId,
    reason: reason || null,
    metadata,
  });
}

/** Số liệu tổng quan cho dashboard, kèm so sánh 7 ngày gần nhất. */
async function getStats() {
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const [
    totalUsers,
    newUsers,
    bannedUsers,
    totalVideos,
    newVideos,
    processingVideos,
    failedVideos,
    totalComments,
    openReports,
    viewAgg,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: since } }),
    User.countDocuments({ bannedAt: { $ne: null } }),
    Video.countDocuments({ isDeleted: false }),
    Video.countDocuments({ isDeleted: false, createdAt: { $gte: since } }),
    Video.countDocuments({ status: 'processing' }),
    Video.countDocuments({ status: 'failed' }),
    Comment.countDocuments({ isDeleted: false }),
    Report.countDocuments({ status: 'open' }),
    Video.aggregate([
      { $match: { isDeleted: false } },
      { $group: { _id: null, views: { $sum: '$viewCount' }, likes: { $sum: '$likeCount' } } },
    ]),
  ]);

  return {
    users: { total: totalUsers, newLast7Days: newUsers, banned: bannedUsers },
    videos: {
      total: totalVideos,
      newLast7Days: newVideos,
      processing: processingVideos,
      failed: failedVideos,
    },
    engagement: {
      views: viewAgg[0]?.views || 0,
      likes: viewAgg[0]?.likes || 0,
      comments: totalComments,
    },
    moderation: { openReports },
  };
}

async function listUsers({ q, page = 1, limit = 20, banned } = {}) {
  const filter = {};
  if (q) filter.username = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (banned === 'true') filter.bannedAt = { $ne: null };
  if (banned === 'false') filter.bannedAt = null;

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  return { items, pagination: { page: Number(page), limit: Number(limit), total } };
}

async function banUser(actor, userId, reason) {
  const user = await User.findById(userId);
  if (!user) throw httpError('Không tìm thấy người dùng', 404);
  if (user.role === 'admin') throw httpError('Không thể khoá tài khoản admin', 403);

  user.bannedAt = new Date();
  user.banReason = reason || 'Vi phạm tiêu chuẩn cộng đồng';
  user.refreshTokens = []; // đăng xuất mọi phiên đang mở
  await user.save({ validateBeforeSave: false });

  await Video.updateMany({ userId }, { moderationStatus: 'removed' });
  await writeAudit(actor, 'user.ban', 'user', user._id, user.banReason);
  return user;
}

async function unbanUser(actor, userId) {
  const user = await User.findByIdAndUpdate(
    userId,
    { bannedAt: null, banReason: null },
    { new: true }
  );
  if (!user) throw httpError('Không tìm thấy người dùng', 404);
  await Video.updateMany({ userId, moderationStatus: 'removed' }, { moderationStatus: 'pending' });
  await writeAudit(actor, 'user.unban', 'user', user._id);
  return user;
}

async function verifyUser(actor, userId) {
  const user = await User.findByIdAndUpdate(userId, { isVerified: true }, { new: true });
  if (!user) throw httpError('Không tìm thấy người dùng', 404);
  await writeAudit(actor, 'user.verify', 'user', user._id);
  return user;
}

async function listVideos({ status, moderationStatus, page = 1, limit = 20 } = {}) {
  const filter = { isDeleted: false };
  if (status) filter.status = status;
  if (moderationStatus) filter.moderationStatus = moderationStatus;

  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    Video.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'username avatarUrl')
      .lean(),
    Video.countDocuments(filter),
  ]);
  return { items, pagination: { page: Number(page), limit: Number(limit), total } };
}

/** Hàng đợi kiểm duyệt: video bị báo cáo nhiều nhất trước. */
async function listFlaggedVideos({ page = 1, limit = 20 } = {}) {
  const skip = (Math.max(1, page) - 1) * limit;
  const filter = {
    isDeleted: false,
    $or: [{ moderationStatus: 'flagged' }, { reportCount: { $gt: 0 } }],
  };
  const [items, total] = await Promise.all([
    Video.find(filter)
      .sort({ reportCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'username avatarUrl')
      .lean(),
    Video.countDocuments(filter),
  ]);

  const reports = await Report.find({ videoId: { $in: items.map((v) => v._id) }, status: 'open' })
    .populate('reporterId', 'username')
    .lean();

  return {
    items: items.map((v) => ({
      ...v,
      reports: reports.filter((r) => String(r.videoId) === String(v._id)),
    })),
    pagination: { page: Number(page), limit: Number(limit), total },
  };
}

async function approveVideo(actor, videoId) {
  const video = await Video.findByIdAndUpdate(
    videoId,
    { moderationStatus: 'approved', flagReason: null, reportCount: 0 },
    { new: true }
  );
  if (!video) throw httpError('Không tìm thấy video', 404);
  await Report.updateMany(
    { videoId, status: 'open' },
    { status: 'rejected', resolvedBy: actor._id, resolvedAt: new Date() }
  );
  await writeAudit(actor, 'video.approve', 'video', video._id);
  return video;
}

async function removeVideo(actor, videoId, reason) {
  const video = await Video.findById(videoId);
  if (!video) throw httpError('Không tìm thấy video', 404);

  video.moderationStatus = 'removed';
  video.flagReason = reason || 'Vi phạm tiêu chuẩn cộng đồng';
  video.isDeleted = true;
  await video.save();

  await Report.updateMany(
    { videoId, status: 'open' },
    { status: 'resolved', resolvedBy: actor._id, resolvedAt: new Date() }
  );
  storageService
    .deletePrefix(`${videoId}/`, storageService.BUCKETS.VIDEOS)
    .catch((err) => logger.warn(`Không xoá được file video ${videoId}: ${err.message}`));

  await writeAudit(actor, 'video.remove', 'video', video._id, video.flagReason);
  return video;
}

async function listReports({ status = 'open', page = 1, limit = 20 } = {}) {
  const skip = (Math.max(1, page) - 1) * limit;
  const filter = status === 'all' ? {} : { status };
  const [items, total] = await Promise.all([
    Report.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('reporterId', 'username avatarUrl')
      .populate('videoId', 'title thumbnailUrl userId')
      .lean(),
    Report.countDocuments(filter),
  ]);
  return { items, pagination: { page: Number(page), limit: Number(limit), total } };
}

/** Người dùng gửi báo cáo; đủ ngưỡng thì tự chuyển video sang trạng thái flagged. */
async function createReport(reporterId, videoId, reason, description) {
  const video = await Video.findOne({ _id: videoId, isDeleted: false });
  if (!video) throw httpError('Không tìm thấy video', 404);

  const existing = await Report.findOne({ videoId, reporterId });
  if (existing) throw httpError('Bạn đã báo cáo video này rồi', 409);

  const report = await Report.create({ videoId, reporterId, reason, description });
  const updated = await Video.findByIdAndUpdate(videoId, { $inc: { reportCount: 1 } }, { new: true });

  const AUTO_FLAG_THRESHOLD = 3;
  if (updated.reportCount >= AUTO_FLAG_THRESHOLD && updated.moderationStatus !== 'removed') {
    await Video.findByIdAndUpdate(videoId, {
      moderationStatus: 'flagged',
      flagReason: `Tự động gắn cờ sau ${AUTO_FLAG_THRESHOLD} báo cáo`,
    });
  }
  return report;
}

async function listAuditLogs({ page = 1, limit = 50 } = {}) {
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total] = await Promise.all([
    AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(),
  ]);
  return { items, pagination: { page: Number(page), limit: Number(limit), total } };
}

module.exports = {
  getStats,
  listUsers,
  banUser,
  unbanUser,
  verifyUser,
  listVideos,
  listFlaggedVideos,
  approveVideo,
  removeVideo,
  listReports,
  createReport,
  listAuditLogs,
};
