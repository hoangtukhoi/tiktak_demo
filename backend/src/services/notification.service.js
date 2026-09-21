const Notification = require('../models/Notification');
const User = require('../models/User');
const { emitToUser } = require('../sockets/notification.socket');
const { SOCKET_EVENTS } = require('../utils/constants');
const logger = require('../utils/logger');

/**
 * Tạo thông báo và đẩy realtime. Không tự thông báo cho chính mình.
 */
async function createNotification(userId, type, payload = {}) {
  if (!userId) return null;
  if (payload.actorId && String(payload.actorId) === String(userId)) return null;

  if (payload.actorId && !payload.actorUsername) {
    const actor = await User.findById(payload.actorId).select('username avatarUrl').lean();
    if (actor) {
      payload.actorUsername = actor.username;
      payload.actorAvatar = actor.avatarUrl;
    }
  }

  const notification = await Notification.create({ userId, type, payload });
  emitToUser(userId, SOCKET_EVENTS.NOTIFICATION, notification);
  logger.debug(`Đã tạo thông báo ${type} cho user ${userId}`);
  return notification;
}

async function getNotifications(userId, { page = 1, limit = 20 } = {}) {
  const skip = (Math.max(1, page) - 1) * limit;
  const [items, total, unreadCount] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments({ userId }),
    Notification.countDocuments({ userId, isRead: false }),
  ]);
  return {
    items,
    unreadCount,
    pagination: { page: Number(page), limit: Number(limit), total, hasMore: skip + items.length < total },
  };
}

async function markAsRead(userId, notificationId) {
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true },
    { new: true }
  );
}

async function markAllAsRead(userId) {
  const result = await Notification.updateMany({ userId, isRead: false }, { isRead: true });
  return result.modifiedCount || 0;
}

async function getUnreadCount(userId) {
  return Notification.countDocuments({ userId, isRead: false });
}

/** Xoá thông báo cũ hơn n ngày, dùng cho job dọn dẹp định kỳ. */
async function pruneOlderThan(days = 60) {
  const cutoff = new Date(Date.now() - days * 24 * 3600 * 1000);
  const result = await Notification.deleteMany({ createdAt: { $lt: cutoff }, isRead: true });
  return result.deletedCount || 0;
}

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  pruneOlderThan,
};
