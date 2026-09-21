const User = require('../models/User');
const Follow = require('../models/Follow');
const Video = require('../models/Video');
const Like = require('../models/Like');
const notificationService = require('./notification.service');
const { NOTIFICATION_TYPES } = require('../utils/constants');

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

async function getProfile(username, currentUserId) {
  const user = await User.findOne({ username }).lean();
  if (!user) throw httpError('Không tìm thấy người dùng', 404);

  const [likeAgg, isFollowing] = await Promise.all([
    Video.aggregate([
      { $match: { userId: user._id, isDeleted: false } },
      { $group: { _id: null, totalLikes: { $sum: '$likeCount' }, totalViews: { $sum: '$viewCount' } } },
    ]),
    currentUserId
      ? Follow.exists({ followerId: currentUserId, followingId: user._id })
      : Promise.resolve(null),
  ]);

  return {
    ...user,
    totalLikes: likeAgg[0]?.totalLikes || 0,
    totalViews: likeAgg[0]?.totalViews || 0,
    isFollowing: Boolean(isFollowing),
    isSelf: String(user._id) === String(currentUserId),
  };
}

async function updateProfile(userId, data) {
  if (data.username) {
    const taken = await User.findOne({ username: data.username, _id: { $ne: userId } });
    if (taken) throw httpError('Username đã được sử dụng', 409);
  }
  const user = await User.findByIdAndUpdate(userId, data, { new: true, runValidators: true });
  if (!user) throw httpError('Không tìm thấy người dùng', 404);
  return user;
}

/** Theo dõi hoặc bỏ theo dõi. Cập nhật bộ đếm hai phía trong cùng thao tác. */
async function toggleFollow(followerId, targetUsername) {
  const target = await User.findOne({ username: targetUsername }).select('_id username');
  if (!target) throw httpError('Không tìm thấy người dùng', 404);
  if (String(target._id) === String(followerId)) throw httpError('Không thể tự theo dõi chính mình', 400);

  const existing = await Follow.findOne({ followerId, followingId: target._id });

  if (existing) {
    await existing.deleteOne();
    await Promise.all([
      User.findByIdAndUpdate(followerId, { $inc: { followingCount: -1 } }),
      User.findByIdAndUpdate(target._id, { $inc: { followerCount: -1 } }),
    ]);
    return { isFollowing: false };
  }

  await Follow.create({ followerId, followingId: target._id });
  await Promise.all([
    User.findByIdAndUpdate(followerId, { $inc: { followingCount: 1 } }),
    User.findByIdAndUpdate(target._id, { $inc: { followerCount: 1 } }),
  ]);

  await notificationService.createNotification(target._id, NOTIFICATION_TYPES.NEW_FOLLOWER, {
    actorId: followerId,
    message: 'đã bắt đầu theo dõi bạn',
  });

  return { isFollowing: true };
}

async function getFollowers(username, { page = 1, limit = 20 } = {}) {
  const user = await User.findOne({ username }).select('_id');
  if (!user) throw httpError('Không tìm thấy người dùng', 404);
  const skip = (Math.max(1, page) - 1) * limit;
  const rows = await Follow.find({ followingId: user._id })
    .sort({ _id: -1 })
    .skip(skip)
    .limit(limit)
    .populate('followerId', 'username avatarUrl bio isVerified')
    .lean();
  return rows.map((r) => r.followerId).filter(Boolean);
}

async function getFollowing(username, { page = 1, limit = 20 } = {}) {
  const user = await User.findOne({ username }).select('_id');
  if (!user) throw httpError('Không tìm thấy người dùng', 404);
  const skip = (Math.max(1, page) - 1) * limit;
  const rows = await Follow.find({ followerId: user._id })
    .sort({ _id: -1 })
    .skip(skip)
    .limit(limit)
    .populate('followingId', 'username avatarUrl bio isVerified')
    .lean();
  return rows.map((r) => r.followingId).filter(Boolean);
}

async function searchUsers(q, limit = 10) {
  if (!q || !q.trim()) return [];
  const term = q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return User.find({ username: new RegExp(term, 'i'), bannedAt: null })
    .select('username avatarUrl bio isVerified followerCount')
    .sort({ followerCount: -1 })
    .limit(Math.min(limit, 50))
    .lean();
}

/**
 * Xoá tài khoản: ẩn toàn bộ nội dung rồi mới xoá bản ghi user,
 * tránh để lại video mồ côi trong feed.
 */
async function deleteAccount(userId) {
  await Promise.all([
    Video.updateMany({ userId }, { isDeleted: true }),
    Follow.deleteMany({ $or: [{ followerId: userId }, { followingId: userId }] }),
    Like.deleteMany({ userId }),
  ]);
  await User.findByIdAndDelete(userId);
  return true;
}

module.exports = {
  getProfile,
  updateProfile,
  toggleFollow,
  getFollowers,
  getFollowing,
  searchUsers,
  deleteAccount,
};
