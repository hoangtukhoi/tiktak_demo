const notificationService = require('../services/notification.service');
const mongoose = require('mongoose');
const { success, error, paginated } = require('../utils/apiResponse');
exports.getNotifications = async (req, res) => {
  const { notifications, nextCursor, hasMore } = await notificationService.getNotifications(
    req.user._id,
    req.query.cursor ?? req.query.page,
    req.query.limit
  );
  // Frontend đọc `data` là mảng; thông tin phân trang nằm trong `pagination`
  paginated(res, notifications, { nextCursor, hasMore });
};
exports.markAsRead = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return error(res, 'Invalid notification id', 400);
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