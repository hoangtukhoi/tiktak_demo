const Notification = require('../models/Notification');
const { emitToUser } = require('../sockets/notification.socket');
exports.createNotification = async (userId, type, payload) => {
  const notif = await Notification.create({ userId, type, payload });
  emitToUser(userId, 'new_notification', notif);
  return notif;
};
exports.getNotifications = async (userId, page = 1, limit = 20) => {
  return Notification.find({ userId }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit);
};
exports.markAsRead = async (userId, notificationId) => {
  return Notification.findOneAndUpdate({ _id: notificationId, userId }, { read: true });
};
exports.markAllAsRead = async (userId) => {
  return Notification.updateMany({ userId, read: false }, { read: true });
};
exports.getUnreadCount = async (userId) => {
  return Notification.countDocuments({ userId, read: false });
};