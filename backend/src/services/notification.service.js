/**
 * Notification Service
 * Handles creation, retrieval, and read-state management of user notifications.
 * Uses `isRead` to match the Notification model schema (fixes prior `read` inconsistency).
 */

const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { emitToUser } = require('../sockets/notification.socket');

/**
 * Create a notification and push it to the recipient via WebSocket.
 *
 * @param {ObjectId|string} userId  - Recipient user ID.
 * @param {string}          type    - Notification type (must match schema enum).
 * @param {object}          payload - Additional data (actorId, videoId, commentId, etc.).
 * @returns {Promise<Notification>}
 */
exports.createNotification = async (userId, type, payload) => {
  const notif = await Notification.create({ userId, type, payload });
  // Emit real-time event to the recipient's socket room
  emitToUser(userId.toString(), 'new_notification', notif);
  return notif;
};

/**
 * Retrieve notifications for a user using cursor-based pagination (newest first).
 *
 * @param {ObjectId|string} userId  - The user whose notifications to fetch.
 * @param {string}         [cursor] - Last _id seen (exclusive upper bound when sorted desc).
 * @param {number}         [limit]  - Max documents to return (default 20, capped at 100).
 * @returns {Promise<{ notifications: Notification[], nextCursor: ObjectId|null, hasMore: boolean }>}
 */
exports.getNotifications = async (userId, cursor, limit = 20) => {
  const safeLimit = Math.min(parseInt(limit) || 20, 100);

  const query = { userId };
  if (cursor && mongoose.Types.ObjectId.isValid(cursor)) {
    query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
  }

  const notifications = await Notification.find(query)
    .sort({ _id: -1 })
    .limit(safeLimit + 1) // fetch one extra to detect if there's a next page
    .lean();

  const hasMore = notifications.length > safeLimit;
  if (hasMore) notifications.pop();

  const nextCursor = hasMore ? notifications[notifications.length - 1]._id : null;

  return { notifications, nextCursor, hasMore };
};

/**
 * Mark a single notification as read for a given user.
 * Scoped to the requesting user to prevent cross-user manipulation.
 *
 * @param {ObjectId|string} userId         - The owner of the notification.
 * @param {ObjectId|string} notificationId - The notification to mark as read.
 * @returns {Promise<Notification|null>}
 */
exports.markAsRead = async (userId, notificationId) => {
  return Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { isRead: true },
    { new: true }
  );
};

/**
 * Mark ALL unread notifications as read for a given user.
 *
 * @param {ObjectId|string} userId - The user whose notifications to update.
 * @returns {Promise<mongoose.UpdateWriteOpResult>}
 */
exports.markAllAsRead = async (userId) => {
  return Notification.updateMany({ userId, isRead: false }, { isRead: true });
};

/**
 * Return the count of unread notifications for a user.
 *
 * @param {ObjectId|string} userId
 * @returns {Promise<number>}
 */
exports.getUnreadCount = async (userId) => {
  return Notification.countDocuments({ userId, isRead: false });
};