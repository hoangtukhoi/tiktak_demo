const notificationService = require('../services/notification.service');
const { success } = require('../utils/apiResponse');
exports.getNotifications = async (req, res) => {
  const notifs = await notificationService.getNotifications(req.user._id, req.query.page, req.query.limit);
  success(res, notifs);
};
exports.markAsRead = async (req, res) => {
  await notificationService.markAsRead(req.user._id, req.params.id);
  success(res, null);
};
exports.markAllAsRead = async (req, res) => {
  await notificationService.markAllAsRead(req.user._id);
  success(res, null);
};
exports.getUnreadCount = async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user._id);
  success(res, { count });
};