const userService = require('../services/user.service');
const videoService = require('../services/video.service');
const { success } = require('../utils/apiResponse');

exports.getProfile = async (req, res) => {
  success(res, await userService.getProfile(req.params.username, req.user?._id));
};

exports.updateProfile = async (req, res) => {
  success(res, await userService.updateProfile(req.user._id, req.body), 200, 'Đã cập nhật hồ sơ');
};

exports.deleteAccount = async (req, res) => {
  await userService.deleteAccount(req.user._id);
  success(res, null, 200, 'Đã xoá tài khoản');
};

exports.searchUsers = async (req, res) => {
  success(res, await userService.searchUsers(req.query.q, Number(req.query.limit) || 10));
};

exports.getUserVideos = async (req, res) => {
  const profile = await userService.getProfile(req.params.username, req.user?._id);
  success(
    res,
    await videoService.getUserVideos(profile._id, {
      cursor: req.query.cursor,
      limit: req.query.limit,
      includePrivate: profile.isSelf,
    })
  );
};

exports.toggleFollow = async (req, res) => {
  success(res, await userService.toggleFollow(req.user._id, req.params.username));
};

exports.getFollowers = async (req, res) => {
  success(res, await userService.getFollowers(req.params.username, req.query));
};

exports.getFollowing = async (req, res) => {
  success(res, await userService.getFollowing(req.params.username, req.query));
};
