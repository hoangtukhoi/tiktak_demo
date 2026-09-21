const notificationService = require('../services/notification.service');
const { success, error } = require('../utils/apiResponse');

exports.getNotifications = async (req, res) => {
  const data = await notificationService.getNotifications(req.user._id, {
    page: Number(req.query.page) || 1,
    limit: Math.min(Number(req.query.limit) || 20, 50),
  });
  success(res, data);
};

exports.markAsRead = async (req, res) => {
  const updated = await notificationService.markAsRead(req.user._id, req.params.id);
  if (!updated) return error(res, 'Không tìm thấy thông báo', 404);
  success(res, updated);
};

exports.markAllAsRead = async (req, res) => {
  const count = await notificationService.markAllAsRead(req.user._id);
  success(res, { updated: count });
};

exports.getUnreadCount = async (req, res) => {
  success(res, { count: await notificationService.getUnreadCount(req.user._id) });
};
