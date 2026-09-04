const videoService = require('../services/video.service');
const { success } = require('../utils/apiResponse');
exports.getForYouFeed = async (req, res) => {
  const videos = await videoService.getTrendingVideos(20);
  success(res, videos);
};
exports.getFollowingFeed = async (req, res) => {
  success(res, []);
};