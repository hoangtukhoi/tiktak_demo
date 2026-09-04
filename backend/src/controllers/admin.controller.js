const User = require('../models/User');
const Video = require('../models/Video');
const { success } = require('../utils/apiResponse');
exports.getStats = async (req, res) => { success(res, { users: 0, videos: 0 }); };
exports.getUsers = async (req, res) => {
  const users = await User.find().limit(20);
  success(res, users);
};
exports.banUser = async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { bannedAt: new Date() }, { new: true });
  success(res, user);
};
exports.unbanUser = async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { bannedAt: null }, { new: true });
  success(res, user);
};
exports.verifyUser = async (req, res) => {
  const user = await User.findByIdAndUpdate(req.params.id, { isVerified: true }, { new: true });
  success(res, user);
};
exports.getVideos = async (req, res) => {
  const videos = await Video.find().limit(20);
  success(res, videos);
};
exports.removeVideo = async (req, res) => {
  await Video.findByIdAndDelete(req.params.id);
  success(res, null);
};
exports.approveVideo = async (req, res) => { success(res, null); };
exports.getFlaggedVideos = async (req, res) => { success(res, []); };
exports.getAuditLogs = async (req, res) => { success(res, []); };