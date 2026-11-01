const mongoose = require('mongoose');
const analytics = require('../services/analytics.service');
const { success, error } = require('../utils/apiResponse');

// GET /api/admin/analytics?range=7|30|90
exports.getAdminAnalytics = async (req, res) => {
  const days = analytics.parseRange(req.query.range, 30);
  success(res, await analytics.getAdminAnalytics(days));
};

// GET /api/users/me/analytics/{overview|content|viewers|followers}?range=7|28|60|365
const TAB_LOADERS = {
  overview: analytics.getCreatorOverview,
  content: analytics.getCreatorContent,
  viewers: analytics.getCreatorViewers,
  followers: analytics.getCreatorFollowers,
};
exports.getMyAnalyticsTab = async (req, res) => {
  const load = TAB_LOADERS[req.params.tab || 'overview'];
  if (!load) return error(res, 'Unknown analytics tab', 404);
  const days = analytics.parseRange(req.query.range, 7);
  success(res, await load(req.user._id, days));
};

// GET /api/users/me/analytics/videos/:id?range=7|28|60
exports.getMyVideoAnalytics = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return error(res, 'Invalid video id', 400);
  const days = analytics.parseRange(req.query.range, 28);
  success(res, await analytics.getCreatorVideoAnalytics(req.user._id, req.params.id, days));
};

// GET /api/admin/analytics/videos/:id?range=7|30|90 — admin xem bất kỳ video nào
exports.getAdminVideoAnalytics = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return error(res, 'Invalid video id', 400);
  const days = analytics.parseRange(req.query.range, 30);
  success(res, await analytics.getAdminVideoAnalytics(req.params.id, days));
};

// GET /api/users/me/analytics/compare?ids=a,b,c — so sánh 2–3 video của chính mình
exports.compareMyVideos = async (req, res) => {
  const ids = [...new Set(String(req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean))];
  if (ids.length < 2 || ids.length > 3) return error(res, 'Chọn từ 2 đến 3 video để so sánh', 400);
  if (!ids.every((id) => mongoose.Types.ObjectId.isValid(id))) return error(res, 'Invalid video id', 400);
  success(res, await analytics.getCreatorCompare(req.user._id, ids));
};
