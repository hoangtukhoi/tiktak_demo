const User = require('../models/User');
const { success, error } = require('../utils/apiResponse');
exports.getProfile = async (req, res) => {
  const user = await User.findOne({ username: req.params.username });
  if (!user) return error(res, 'User not found', 404);
  success(res, user);
};
exports.updateProfile = async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user._id, req.body, { new: true });
  success(res, user);
};
exports.deleteAccount = async (req, res) => {
  await User.findByIdAndDelete(req.user._id);
  success(res, null, 200, 'Account deleted');
};
exports.getUserVideos = async (req, res) => {
  success(res, []);
};
exports.searchUsers = async (req, res) => {
  const users = await User.find({ username: new RegExp(req.query.q, 'i') }).limit(10);
  success(res, users);
};