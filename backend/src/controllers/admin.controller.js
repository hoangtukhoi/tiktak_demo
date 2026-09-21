const adminService = require('../services/admin.service');
const { success } = require('../utils/apiResponse');

exports.getStats = async (req, res) => success(res, await adminService.getStats());

exports.getUsers = async (req, res) => success(res, await adminService.listUsers(req.query));

exports.banUser = async (req, res) =>
  success(res, await adminService.banUser(req.user, req.params.id, req.body?.reason), 200, 'Đã khoá tài khoản');

exports.unbanUser = async (req, res) =>
  success(res, await adminService.unbanUser(req.user, req.params.id), 200, 'Đã mở khoá tài khoản');

exports.verifyUser = async (req, res) =>
  success(res, await adminService.verifyUser(req.user, req.params.id), 200, 'Đã xác thực tài khoản');

exports.getVideos = async (req, res) => success(res, await adminService.listVideos(req.query));

exports.getFlaggedVideos = async (req, res) =>
  success(res, await adminService.listFlaggedVideos(req.query));

exports.approveVideo = async (req, res) =>
  success(res, await adminService.approveVideo(req.user, req.params.id), 200, 'Đã duyệt video');

exports.removeVideo = async (req, res) =>
  success(res, await adminService.removeVideo(req.user, req.params.id, req.body?.reason), 200, 'Đã gỡ video');

exports.getReports = async (req, res) => success(res, await adminService.listReports(req.query));

exports.getAuditLogs = async (req, res) => success(res, await adminService.listAuditLogs(req.query));
