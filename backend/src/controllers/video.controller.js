const videoService = require('../services/video.service');
const { success } = require('../utils/apiResponse');
exports.createVideo = async (req, res) => {
  const video = await videoService.createVideo(req.user._id, req.body);
  success(res, video, 201);
};
exports.getVideo = async (req, res) => {
  const video = await videoService.getVideoById(req.params.id, req.user?._id);
  success(res, video);
};
exports.updateVideo = async (req, res) => {
  const video = await videoService.updateVideo(req.params.id, req.user._id, req.body);
  success(res, video);
};
exports.deleteVideo = async (req, res) => {
  await videoService.deleteVideo(req.params.id, req.user._id);
  success(res, null, 200, 'Deleted');
};
exports.likeVideo = async (req, res) => { success(res, null); };
exports.recordView = async (req, res) => { success(res, null); };
exports.getForYouFeed = async (req, res) => { success(res, await videoService.getTrendingVideos()); };
exports.getFollowingFeed = async (req, res) => { success(res, []); };
exports.searchVideos = async (req, res) => {
  const videos = await videoService.searchVideos(req.query.q, req.query.page, req.query.limit);
  success(res, videos);
};
exports.updateVideoUrls = async (req, res) => {
  const video = await videoService.updateVideoUrls(req.params.id, req.body);
  success(res, video);
};