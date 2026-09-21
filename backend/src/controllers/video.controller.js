const videoService = require('../services/video.service');
const adminService = require('../services/admin.service');
const { success } = require('../utils/apiResponse');

exports.createVideo = async (req, res) => {
  const video = await videoService.createVideo(req.user._id, req.body);
  success(res, video, 201, 'Đã tạo video');
};

exports.getVideo = async (req, res) => {
  success(res, await videoService.getVideoById(req.params.id, req.user?._id));
};

exports.updateVideo = async (req, res) => {
  success(res, await videoService.updateVideo(req.params.id, req.user._id, req.body));
};

exports.deleteVideo = async (req, res) => {
  await videoService.deleteVideo(req.params.id, req.user._id);
  success(res, null, 200, 'Đã xoá video');
};

exports.likeVideo = async (req, res) => {
  success(res, await videoService.toggleLike(req.params.id, req.user._id));
};

exports.recordView = async (req, res) => {
  success(res, await videoService.recordView(req.params.id, req.body?.watchTimeMs));
};

exports.searchVideos = async (req, res) => {
  success(
    res,
    await videoService.searchVideos(req.query.q, { page: req.query.page, limit: req.query.limit })
  );
};

exports.getTrendingHashtags = async (req, res) => {
  success(res, await videoService.getTrendingHashtags(Number(req.query.days) || 7));
};

exports.getVideosByHashtag = async (req, res) => {
  success(
    res,
    await videoService.getVideosByHashtag(req.params.tag, {
      cursor: req.query.cursor,
      limit: req.query.limit,
    })
  );
};

exports.reportVideo = async (req, res) => {
  const { reason, description } = req.body;
  const report = await adminService.createReport(req.user._id, req.params.id, reason, description);
  success(res, report, 201, 'Đã gửi báo cáo');
};
